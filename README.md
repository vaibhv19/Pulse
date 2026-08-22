# Pulse — Performance & Load Testing Framework

Pulse is a dedicated performance, load, and resilience testing framework designed to prove that backend systems (specifically Phoenix / Trajectory APIs) hold up under load.

> 💡 **Aegis proves a system behaves correctly. Pulse proves the system holds up under load.**

---

## Repository Structure

The framework is organized into distinct areas of concern:

```text
Pulse/
├── .github/
│   └── workflows/
│       └── validation.yml       # CI validation workflow running k6 smoke tests & archiving diagnostics
├── docker/
│   ├── grafana/
│   │   └── provisioning/
│   │       └── datasources/
│   │           └── influxdb.yml # Pre-configures InfluxDB data source in Grafana
│   └── docker-compose.yml       # InfluxDB + Grafana + on-demand k6 setup
├── k6/
│   ├── config/
│   │   ├── loader.js            # Environment & Target config loader (resolves overrides & budgets)
│   │   ├── targets.js           # API Target Registry (supported systems, endpoints, test data)
│   │   ├── budgets.js           # Centralized Performance Budgets (latency and error limits)
│   │   ├── local.json           # Local load profile configuration (VUs, durations)
│   │   ├── development.json     # Dev load profile configuration (VUs, durations)
│   │   ├── staging.json         # Staging load profile configuration (VUs, durations)
│   │   └── production-like.json # Production-like load profile configuration (VUs, durations)
│   ├── lib/
│   │   └── utils.js             # Reusable helper utilities
│   ├── scripts/
│   │   ├── smoke_test.js        # Smoke test scenario (single target GET request)
│   │   └── load_test.js         # Core load test scenario (multi-endpoint ramping concurrent run)
│   └── main.js                  # Main entrypoint, thresholds evaluation, and summary export hooks
└── README.md                    # Developer guide (this file)
```

---

## Prerequisites

Ensure you have the following installed locally:
- **Docker Desktop** (version 20.10+ or equivalent)
- **Docker Compose** (v2.0+)
- **Git**

No local installation of Go or k6 is required, as all tools run inside Docker containers.

---

## Configuration and Targeting Strategy

Pulse uses an environment-aware target configuration strategy. To resolve the final configuration, the system combines:
1. **Target Selection (`PULSE_TARGET`)**: Defines the API to target (e.g., `phoenix` or `trajectory`).
2. **Environment Selection (`PULSE_ENV`)**: Defines the target environment profile (e.g., `local`, `development`, `staging`, `production-like`).
3. **Scenario Selection (`PULSE_SCENARIO`)**: Defines the scenario profile to execute:
   - `load` (Default) — Ramping-VU concurrent load test
   - `smoke` — Light constant-VU smoke validation

---

## Centralized Performance Budgets

Performance budgets define latency and failure constraints for targets and scenarios. They are defined centrally in [budgets.js](k6/config/budgets.js) to avoid duplication.

### Enforced Metrics

1. **p95 Latency (`p95Latency`)**: Evaluated via k6 `http_req_duration`. E.g., `p(95) < 1800` ms.
   - *Rationale:* Ensures that tail latency remains acceptable under load, guarding against performance regressions.
2. **Request Failure Rate (`maxFailureRate`)**: Evaluated via k6 `http_req_failed`. E.g., `rate < 0.02` (2% failure limit).
   - *Rationale:* Guards against hidden system failures, resource leaks, or error responses under load.

### Precedence Resolution Rules

When a scenario is launched, configuration parameters and budgets are resolved in this strict order:
1. **Default Framework Configuration**: Generic fallback values (`vus: 1`, default budget limits).
2. **Environment Load Profile**: Loads load parameters (VUs, durations) from profile JSON files (`k6/config/local.json`, etc.).
3. **Target Registry & Centralized Budgets**:
   - Base URLs and API versions fetched from the [targets.js](k6/config/targets.js) registry.
   - Threshold parameters mapped from the [budgets.js](k6/config/budgets.js) registry based on Target + Scenario.
4. **Environment-Specific Budget Overrides**: Custom budgets specified for the active environment (e.g. `staging`) inside `budgets.js`.
5. **Runtime Overrides**: Values supplied via environment variables (`__ENV`) take absolute priority.

### Overrides via Environment Variables

You can override resolved config and budget values at runtime:
- `PULSE_ENV`: Target environment (default: `local`)
- `PULSE_TARGET`: Target API (e.g., `phoenix`, `trajectory`) — **Must be explicitly provided**
- `PULSE_SCENARIO`: Scenario selector (`load`, `smoke`, default: `load`)
- `PULSE_TARGET_URL`: Overrides resolved base URL
- `PULSE_VUS`: Overrides Virtual User (VU) count
- `PULSE_DURATION`: Overrides execution duration (for smoke tests)
- `PULSE_RAMP_UP`/`PULSE_HOLD`/`PULSE_RAMP_DOWN`: Overrides load profile durations
- `PULSE_BUDGET_LATENCY`: Overrides p95 latency limit in ms (e.g., `500` for 500ms)
- `PULSE_BUDGET_FAILURES`: Overrides maximum failure rate (e.g., `0.05` for 5% limit)

---

## Getting Started (Local Setup & Startup Order)

Follow these steps to initialize the local environment and execute test runs.

### Step 1: Start the Infrastructure

Run the following command from the root of the repository to start **InfluxDB** and **Grafana** in detached mode:

```bash
docker compose -f docker/docker-compose.yml up -d influxdb grafana
```

This starts InfluxDB (on port `8086`) and Grafana (on port `3000`).

### Step 2: Verify Service Connectivity

- **InfluxDB**: Run `curl http://localhost:8086/ping` (should return HTTP status `204`).
- **Grafana**: Open [http://localhost:3000](http://localhost:3000) (Username: `admin`, Password: `admin`).

### Step 3: Run Core Load Scenarios & Gated Paths

#### The Passing Path (Normal Execution)

A representative workload that runs successfully within budgets:

```bash
docker compose -f docker/docker-compose.yml run --rm k6
```

This should output a clean metrics summary, execute successfully, and exit with code `0`.

#### The Failing Path (Intentional Budget Violations)

You can trigger a threshold failure by setting an intentionally strict runtime budget override:

```bash
# Violates latency: p95 duration must be under 10ms
docker compose -f docker/docker-compose.yml run --rm -e PULSE_BUDGET_LATENCY=10 k6

# Violates failure rate: maximum failure rate of 0% (if any request fails)
docker compose -f docker/docker-compose.yml run --rm -e PULSE_BUDGET_FAILURES=0.00 k6
```

If a threshold is crossed, k6 will flag it in red, output a console warning, and exit with a non-zero exit code (`1` or `99`), causing the execution command to fail.

### Step 4: Inspect Diagnostics Summaries

At the end of each run, k6 generates two summary files inside the `k6/` directory:
- `summary.json`: Detailed machine-readable JSON summary of metrics and thresholds evaluation.
- `summary.txt`: Human-readable console text summary.

### Step 5: Tear Down Infrastructure

To stop and remove all local containers and volumes:

```bash
docker compose -f docker/docker-compose.yml down -v
```

---

## CI/CD Validation & Diagnostics

A GitHub Actions workflow is defined in `.github/workflows/validation.yml`.

On every push and pull request to `main`, the CI runner:
1. Prepares the environment and runs the Pulse load test scenario (in dry-run mode against the public `test.k6.io` baseline API).
2. Evaluates the resolved performance budget thresholds.
3. If k6 exits with a non-zero exit code due to a performance gate failure, **the CI workflow job fails**.
4. Regardless of execution success or failure, the workflow archives the generated diagnostics files (`summary.json`, `summary.txt`) as workflow artifacts.
