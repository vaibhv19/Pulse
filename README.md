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
│   │   ├── loader.js            # Environment & Target config loader (resolves overrides)
│   │   ├── targets.js           # API Target Registry (supported systems, endpoints, test data)
│   │   ├── local.json           # Local load profile configuration
│   │   ├── development.json     # Dev load profile configuration
│   │   ├── staging.json         # Staging load profile configuration
│   │   └── production-like.json # Production-like load profile configuration
│   ├── lib/
│   │   └── utils.js             # Reusable helper utilities
│   ├── scripts/
│   │   └── smoke_test.js        # Basic test scenario executing GET request from registry
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

## Configuration and Targeting Strategy

Pulse uses an environment-aware target configuration strategy. To resolve the final configuration, the system combines:
1. **Target Selection (`PULSE_TARGET`)**: Defines the API to target (e.g. `phoenix` or `trajectory`).
2. **Environment Selection (`PULSE_ENV`)**: Defines the target environment profile (e.g. `local`, `development`, `staging`, `production-like`).

### Precedence Resolution Rules

When a scenario is launched, configuration parameters are resolved in this strict order:
1. **Default Framework Configuration**: Generic fallback values (`vus: 1`, `duration: '5s'`, `apiVersion: 'v1'`).
2. **Environment Load Profile**: Loads load parameters (e.g. `vus` and `duration` thresholds) from environment profile files (`k6/config/local.json`, etc.).
3. **Target Environment Configuration**: Base URLs and API versions fetched from the [targets.js](k6/config/targets.js) registry.
4. **Runtime Overrides**: Values supplied via environment variables (`__ENV`) take absolute priority over static files.

### Overrides via Environment Variables

You can override resolved config values at runtime by setting:
- `PULSE_ENV`: Target environment (default: `local`)
- `PULSE_TARGET`: Target API (e.g., `phoenix`, `trajectory`) — **Must be explicitly provided**
- `PULSE_TARGET_URL`: Overrides resolved base URL (e.g., `http://localhost:4000`)
- `PULSE_VUS`: Overrides Virtual User (VU) count (e.g., `5`)
- `PULSE_DURATION`: Overrides execution duration (e.g., `30s`)
- `PULSE_API_VERSION`: Overrides target API version (e.g., `v3`)

### Registry Extensibility: Adding a New Target

To register a new target system:
1. Open [k6/config/targets.js](k6/config/targets.js).
2. Append a new target configuration block:
   ```javascript
   my_api: {
     id: 'my_api',
     displayName: 'My New API Service',
     environments: {
       local: { baseUrl: 'http://test.k6.io', apiVersion: 'v1' },
       staging: { baseUrl: 'https://staging.myapi.local', apiVersion: 'v1' },
       // ... other environments
     },
     endpoints: {
       health: { id: 'health', method: 'GET', path: '/health' },
       // ... other endpoints
     },
     testData: {
       sampleId: 'id_123'
     }
   }
   ```
No loader source code changes are required.

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

### Step 3: Run Target Configurations

Execute local tests and stream results to InfluxDB using the following commands:

```bash
# 1. Run Phoenix smoke test (defaults to Phoenix in docker-compose.yml)
docker compose -f docker/docker-compose.yml run --rm k6

# 2. Run Trajectory smoke test
docker compose -f docker/docker-compose.yml run --rm -e PULSE_TARGET=trajectory k6

# 3. Target Staging environment for Trajectory
docker compose -f docker/docker-compose.yml run --rm -e PULSE_TARGET=trajectory -e PULSE_ENV=staging k6

# 4. Run with custom base URL override
docker compose -f docker/docker-compose.yml run --rm -e PULSE_TARGET=phoenix -e PULSE_TARGET_URL=https://httpbin.org/anything k6
```

### Configuration Error Handling

If you omit the target identifier or select an invalid setting, the configuration loader will throw an explicit error and stop execution:

```bash
# Throws error: No API target selected
docker compose -f docker/docker-compose.yml run --rm -e PULSE_TARGET="" k6

# Throws error: Unsupported target: "invalid"
docker compose -f docker/docker-compose.yml run --rm -e PULSE_TARGET=invalid k6
```

### Step 4: Tear Down Infrastructure

To stop and remove all local containers and volumes, run:

```bash
docker compose -f docker/docker-compose.yml down -v
```

---

## CI/CD Validation

A GitHub Actions workflow is defined in `.github/workflows/validation.yml`. 
On every push and pull request to `main`, the CI runner executes the k6 entrypoint using the official `grafana/k6-action@v2` running as a dry-run syntax check, using `PULSE_TARGET=phoenix` in the `local` environment.
