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
│       └── validation.yml       # CI validation workflow running k6 smoke tests
├── docker/
│   ├── grafana/
│   │   └── provisioning/
│   │       └── datasources/
│   │           └── influxdb.yml # Pre-configures InfluxDB data source in Grafana
│   └── docker-compose.yml       # InfluxDB + Grafana + on-demand k6 setup
├── k6/
│   ├── config/
│   │   ├── loader.js            # Environment config loader (resolves overrides)
│   │   ├── local.json           # Local environment settings (defaults to http://test.k6.io)
│   │   ├── development.json     # Dev environment settings
│   │   ├── staging.json         # Staging environment settings
│   │   └── production-like.json # Production-like environment settings
│   ├── lib/
│   │   └── utils.js             # Reusable helper utilities
│   ├── scripts/
│   │   └── smoke_test.js        # Basic test scenario executing GET request
│   └── main.js                  # Main entrypoint and scenario runner definition
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

## Configuration and Environments

Pulse supports environment-specific configuration via JSON files in `k6/config/`. The active environment is determined by the `PULSE_ENV` environment variable:
- `local` (Default)
- `development`
- `staging`
- `production-like`

### Overrides via Environment Variables

You can override config values without editing JSON files by setting the following environment variables:
- `PULSE_ENV`: Environment config selection (e.g. `staging`)
- `PULSE_TARGET_URL`: Base target URL (e.g. `http://localhost:4000`)
- `PULSE_VUS`: Virtual User (VU) count override (e.g. `5`)
- `PULSE_DURATION`: Test duration override (e.g. `30s`)

---

## Getting Started (Local Setup & Startup Order)

Follow these steps to initialize the local environment and execute test runs.

### Step 1: Start the Infrastructure

Run the following command from the root of the repository to start **InfluxDB** and **Grafana** in detached mode:

```bash
docker compose -f docker/docker-compose.yml up -d influxdb grafana
```

This starts:
1. **InfluxDB** (on port `8086`) - creates the `k6` database for storing metrics.
2. **Grafana** (on port `3000`) - provisions `InfluxDB` automatically as the default data source.

### Step 2: Verify Service Connectivity

To check if the databases and dashboards are healthy:
- **InfluxDB**: Run `curl http://localhost:8086/ping` (should return HTTP status `204`).
- **Grafana**: Open [http://localhost:3000](http://localhost:3000) in your browser. (Sign in with Username: `admin`, Password: `admin` if prompted, though anonymous Admin access is pre-configured).

### Step 3: Run the Smoke Test

To run the foundation smoke test scenario through k6 and stream the results to InfluxDB, execute:

```bash
docker compose -f docker/docker-compose.yml run --rm k6
```

This will run the k6 load test container, output live metrics in the terminal, stream data directly to InfluxDB, and automatically remove the container when complete.

To run tests targeting a different environment or custom URL:

```bash
# Target the Staging environment
docker compose -f docker/docker-compose.yml run --rm -e PULSE_ENV=staging k6

# Target a local server with custom load options
docker compose -f docker/docker-compose.yml run --rm -e PULSE_TARGET_URL=http://localhost:4000 -e PULSE_VUS=5 -e PULSE_DURATION=10s k6
```

### Step 4: Tear Down Infrastructure

To stop and remove all local containers and volumes, run:

```bash
docker compose -f docker/docker-compose.yml down -v
```

---

## CI/CD Validation

A GitHub Actions workflow is defined in `.github/workflows/validation.yml`. 
On every push and pull request to `main`, the CI runner:
1. Checks out the source code.
2. Performs a syntax dry-run of our k6 entrypoint using the official `grafana/k6-action@v2`.
3. Verifies that all configuration files and utility modules resolve successfully.
