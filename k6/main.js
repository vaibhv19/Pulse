// k6/main.js
import { getConfig } from './config/loader.js';
import { runSmokeTest } from './scripts/smoke_test.js';

const config = getConfig();

// Configure the execution options for k6 using the environment config.
export const options = {
  scenarios: {
    smoke_test: {
      executor: 'constant-vus',
      vus: config.vus,
      duration: config.duration,
      exec: 'smoke'
    }
  },
  thresholds: {
    // Basic performance thresholds for verification
    http_req_failed: ['rate<0.01'], // Less than 1% failure rate
    http_req_duration: ['p(95)<2000'] // 95% of requests must complete within 2s
  },
  tags: {
    environment: config.environment,
    framework: 'pulse'
  }
};

/**
 * Entry point for the smoke test scenario.
 */
export function smoke() {
  runSmokeTest(config);
}
