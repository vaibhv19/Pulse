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
│   ├── baselines/
│   │   └── phoenix_load_baseline.json # Centralized baseline profile for Phoenix load
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
│   ├── reports/                 # Output performance reports directory (ignored by git)
│   │   ├── performance_report.md  # Human-readable markdown run summary and baseline comparison
│   │   └── performance_report.json # Normalized machine-readable JSON execution results
│   ├── scripts/
│   │   ├── smoke_test.js        # Smoke test scenario (single target GET request)
│   │   ├── load_test.js         # Core load test scenario (multi-endpoint ramping concurrent run)
│   │   ├── stress_test.js       # Escalating stress test scenario (multi-step concurrency run)
│   │   ├── recovery_test.js     # Post-stress recovery check (single-user health probe)
│   │   └── compare.js           # Node.js run comparison processor
│   └── main.js                  # Main entrypoint, thresholds evaluation, and summary export hooks
└── README.md                    # Developer guide (this file)
```

---

## Prerequisites

Ensure you have the following installed locally:
- **Docker Desktop** (version 20.10+ or equivalent)
- **Docker Compose** (v2.0+)
- **Git**
- **Node.js** (for running post-test comparisons)

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

## Performance Run Reports

Every execution of Pulse automatically generates normalized report outputs under the `k6/reports/` directory:
- `performance_report.json`: Machine-readable JSON summary of metrics, configurations, gates, and baseline comparison stats.
- `performance_report.md`: Human-readable Markdown summary documenting execution metadata, core performance metrics, active budget gates, and the comparison tables.

---

## Baseline Comparison & Compatibility

To track performance changes over time, Pulse compares the current run against a verified baseline profile:
1. **Storage:** Baseline files are stored centrally under `k6/baselines/` naming pattern:
   `k6/baselines/{target}_{scenario}_baseline.json`
2. **Variance Limits (5%):** Key metrics (p95 latency, p99 latency, and throughput) are compared and classified:
   - `Improved` — Performance improved by > 5%.
   - `Regressed` — Performance degraded by > 5%.
   - `Unchanged` — Performance remains within the 5% variance limit.
3. **Graceful Skip & Safety:**
   - Mismatched metadata (different target or scenario) will skip comparison with a warning.
   - Missing baseline files are handled gracefully without crashing, establishing the current run as the initial baseline.

### How to Establish a Baseline

Once you have a verified, stable performance run, copy its output report into the baselines folder:

```bash
cp k6/reports/performance_report.json k6/baselines/phoenix_load_baseline.json
```

---

## Getting Started (Local Setup & Startup Order)

Follow these steps to initialize the local environment, execute tests, and generate performance reports.

### Step 1: Start the Infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d influxdb grafana
```

### Step 2: Run Performance Test Scenarios

#### Load Test Scenario

```bash
docker compose -f docker/docker-compose.yml run --rm k6
```

#### Stress Test Scenario

```bash
docker compose -f docker/docker-compose.yml run --rm -e PULSE_SCENARIO=stress k6
```

### Step 3: Generate Run Comparison & Reports

Execute the comparison processor using Node.js:

```bash
node k6/scripts/compare.js
```

This will read the last run's metrics, search for a compatible baseline file, compute variations, and write the final outputs to `k6/reports/performance_report.md` and `k6/reports/performance_report.json`.

### Step 4: Tear Down Infrastructure & Metrics Lifecycle

- **Normal Shutdown:**
  ```bash
  docker compose -f docker/docker-compose.yml down
  ```
- **Reset Environment (Wipe Metrics):**
  ```bash
  docker compose -f docker/docker-compose.yml down -v
  ```
