# Pulse — Feature List

- **Project Name:** Pulse (Performance & Load Testing Framework)
- **Stack:** k6 + Grafana + InfluxDB + GitHub Actions
- **Target:** Phoenix / Trajectory APIs
- **Core Differentiator:** Performance & Resilience Testing

## Core Features

- **Load Testing Scripts:** Simulating concurrent users hitting key API endpoints.
- **Threshold-Based Pass/Fail Gates in CI:** (e.g., p95 latency must stay under a defined limit) — a build can fail on performance, not just broken functionality.
- **Stress Testing:** Find the actual breaking point (max concurrent load before failure).
- **Grafana Dashboard:** Visualizing latency percentiles, throughput, and error rate over time.
- **Distinct Failure Mode from Aegis:** Proves the system holds up under load, not just that it behaves correctly.
