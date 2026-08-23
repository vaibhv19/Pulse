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
│   │       ├── datasources/
│   │       │   └── influxdb.yml # Pre-configures InfluxDB data source in Grafana
│   │       └── dashboards/
│   │           ├── dashboards.yml # Automatically provisions Pulse dashboards
│   │           └── files/
│   │               └── pulse_dashboard.json # Pre-configured Pulse Performance Dashboard
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

## Metrics & Observability Dashboard

When k6 runs inside Docker Compose, it streams telemetry to InfluxDB. Grafana reads this datasource and visualizes performance via an automatically provisioned dashboard.

### Core Metrics Tracked

1. **Latency Percentiles:** Graphing the median (p50), tail (p95), and peak (p99) response times over time.
2. **Request Throughput:** Number of processed requests per second.
3. **Error / Failure Rate:** Graphing the percentage of failed requests over time.
4. **Virtual User Concurrency:** The ramping active VU levels.
5. **Execution Volume Cards:** Summary KPIs displaying Total Requests, Error Rate, and Max VUs.

### Dashboard Variables and Filtering

The Pulse dashboard features dropdown filters at the top:
- **Target:** Filter by `phoenix` or `trajectory`.
- **Environment:** Filter by environment (e.g., `local`, `staging`).
- **Scenario:** Filter by run class (`smoke_test`, `load_test`, `stress_test`, `recovery_test`).

### Run Telemetry Tagging

Every request metric is tagged automatically by k6 with metadata:
- `target`: Mapped from targets config.
- `environment`: Inherited from the config target environment.
- `scenario`: Resolves the run scenario.
- `endpoint`: Resolves the resource label.

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

---

## Getting Started (Local Setup & Startup Order)

Follow these steps to initialize the local environment and execute test runs.

### Step 1: Start the Infrastructure

Run the following command from the root of the repository to start **InfluxDB** and **Grafana** in detached mode:

```bash
docker compose -f docker/docker-compose.yml up -d influxdb grafana
```

This will automatically configure InfluxDB and provision the **Pulse Performance Dashboard**.

### Step 2: Open Grafana

1. Navigate to [http://localhost:3000](http://localhost:3000) in your browser.
2. Sign in with credentials (Username: `admin`, Password: `admin`).
3. Under the **Dashboards** menu, locate the **Pulse** folder and open the **Pulse Performance Dashboard**.

### Step 3: Run Performance Test Scenarios

#### Load Test Scenario (Passing Path)

```bash
docker compose -f docker/docker-compose.yml run --rm k6
```

#### Stress Test Scenario

```bash
docker compose -f docker/docker-compose.yml run --rm -e PULSE_SCENARIO=stress k6
```

As soon as a test runs, select **Last 5 minutes** or **Last 15 minutes** with a **5s refresh rate** in Grafana to see real-time performance graphs.

### Step 4: Tear Down Infrastructure & Metrics Lifecycle

- **Normal Shutdown:** Stops and removes docker containers while *preserving* InfluxDB historical metrics:
  ```bash
  docker compose -f docker/docker-compose.yml down
  ```
- **Reset Environment (Wipe Metrics):** Stops containers and *destroys* InfluxDB/Grafana volumes to completely clear history:
  ```bash
  docker compose -f docker/docker-compose.yml down -v
  ```
