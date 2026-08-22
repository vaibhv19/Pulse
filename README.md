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
│   │   ├── local.json           # Local load & stress profile configuration (VUs, durations)
│   │   ├── development.json     # Dev load & stress profile configuration (VUs, durations)
│   │   ├── staging.json         # Staging load & stress profile configuration (VUs, durations)
│   │   └── production-like.json # Production-like load & stress profile configuration (VUs, durations)
│   ├── lib/
│   │   └── utils.js             # Reusable helper utilities
│   ├── scripts/
│   │   ├── smoke_test.js        # Smoke test scenario (single target GET request)
│   │   ├── load_test.js         # Core load test scenario (multi-endpoint ramping concurrent run)
│   │   ├── stress_test.js       # Escalating stress test scenario (multi-step concurrency run)
│   │   └── recovery_test.js     # Post-stress recovery check (single-user health probe)
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
   - `stress` — Progressive escalating multi-step stress test to discover system boundaries and recovery

---

## Centralized Performance Budgets

Performance budgets define latency and failure constraints for targets and scenarios. They are defined centrally in [budgets.js](k6/config/budgets.js) to avoid duplication.

### Enforced Metrics

1. **p95 Latency (`p95Latency`)**: Evaluated via k6 `http_req_duration`.
   - *Load Test limit:* E.g. `p(95) < 1800ms`
   - *Stress Test limit:* E.g. `p(95) < 5000ms` (relaxed to accommodate expected saturation/degradation)
2. **Request Failure Rate (`maxFailureRate`)**: Evaluated via k6 `http_req_failed`.
   - *Load Test limit:* E.g. `rate < 0.02` (2% failure limit)
   - *Stress Test limit:* E.g. `rate < 0.10` (10% failure limit; failures above this indicate complete target crash)

### Precedence Resolution Rules

When a scenario is launched, configuration parameters and budgets are resolved in this strict order:
1. **Default Framework Configuration**: Generic fallback values (`vus: 1`, default budget limits).
2. **Environment Load/Stress Profile**: Loads profile parameters from JSON files (`k6/config/local.json`, etc.).
3. **Target Registry & Centralized Budgets**:
   - Base URLs and API versions fetched from the [targets.js](k6/config/targets.js) registry.
   - Threshold parameters mapped from the [budgets.js](k6/config/budgets.js) registry based on Target + Scenario.
4. **Environment-Specific Budget Overrides**: Custom budgets specified for the active environment (e.g. `staging`) inside `budgets.js`.
5. **Runtime Overrides**: Values supplied via environment variables (`__ENV`) take absolute priority.

### Overrides via Environment Variables

You can override resolved config and budget values at runtime:
- `PULSE_ENV`: Target environment (default: `local`)
- `PULSE_TARGET`: Target API (e.g., `phoenix`, `trajectory`) — **Must be explicitly provided**
- `PULSE_SCENARIO`: Scenario selector (`load`, `smoke`, `stress`, default: `load`)
- `PULSE_TARGET_URL`: Overrides resolved base URL
- `PULSE_VUS`: Overrides Virtual User (VU) count
- `PULSE_DURATION`: Overrides execution duration (for smoke tests)
- `PULSE_RAMP_UP`/`PULSE_HOLD`/`PULSE_RAMP_DOWN`: Overrides load profile durations
- `PULSE_BUDGET_LATENCY`: Overrides performance budget p95 latency limit in ms (e.g., `500` for 500ms)
- `PULSE_BUDGET_FAILURES`: Overrides maximum failure rate (e.g., `0.05` for 5% limit)
- `PULSE_STRESS_MAX_VUS`: Overrides stress testing max concurrent VUs (e.g. `20`)
- `PULSE_STRESS_STEP_DURATION`: Overrides stress testing step duration (e.g. `'10s'`)
- `PULSE_STRESS_STAGES_COUNT`: Overrides stress step stages count (e.g. `4`)
- `PULSE_STRESS_HOLD`: Overrides stress hold duration (e.g. `'30s'`)
- `PULSE_STRESS_RAMP_DOWN`: Overrides stress ramp down duration (e.g. `'10s'`)

---

## Stress & Resilience Testing Workflow

When running in stress mode (`PULSE_SCENARIO=stress`), Pulse automatically orchestrates:
1. **Escalating Step-stages**: The framework escalates active Virtual Users progressively (e.g., local default: 1 VU -> 2 VUs -> 3 VUs -> 4 VUs) over multiple steps.
2. **Hold Stage**: Sustains maximum concurrent user pressure for a defined period to check for degradation.
3. **Ramp-down**: Smoothly terminates VUs to 0.
4. **Post-Stress Recovery Check**: Once stress load drops to 0, k6 dynamically schedules and launches a secondary single-iteration scenario (`recovery_test`) to verify if the API target has recovered, returns HTTP `200 OK`, and is responsive.

---

## Getting Started (Local Setup & Startup Order)

Follow these steps to initialize the local environment and execute test runs.

### Step 1: Start the Infrastructure

Run the following command from the root of the repository to start **InfluxDB** and **Grafana** in detached mode:

```bash
docker compose -f docker/docker-compose.yml up -d influxdb grafana
```

### Step 2: Run Gated Paths & Scenarios

#### Load Test Scenario (Passing Path)

```bash
docker compose -f docker/docker-compose.yml run --rm k6
```

#### Stress Test Scenario

To run the progressive stress and resilience recovery validation flow against the default target (`phoenix` on `test.k6.io`):

```bash
docker compose -f docker/docker-compose.yml run --rm -e PULSE_SCENARIO=stress k6
```

#### Stress Test Override Configuration (Failing Path validation)

To test catastrophic crash bounds or stress thresholds fail-fast checks:

```bash
# Force latency gate failure during stress run
docker compose -f docker/docker-compose.yml run --rm -e PULSE_SCENARIO=stress -e PULSE_BUDGET_LATENCY=5 k6
```

If a threshold is crossed, the execution will output a warning and exit with a non-zero code.

### Step 3: Inspect Diagnostics Summaries

At the end of each run, k6 generates two summary files inside the `k6/` directory:
- `summary.json`: Detailed machine-readable JSON summary of metrics and thresholds evaluation.
- `summary.txt`: Human-readable console text summary.

### Step 4: Tear Down Infrastructure

To stop and remove all local containers and volumes:

```bash
docker compose -f docker/docker-compose.yml down -v
```
