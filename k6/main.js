// k6/main.js
import { getConfig } from './config/loader.js';
import { runSmokeTest } from './scripts/smoke_test.js';
import { runLoadTest } from './scripts/load_test.js';

const config = getConfig();
const scenarioType = __ENV.PULSE_SCENARIO || 'load';

let activeScenarios = {};

// Setup scenarios dynamically based on PULSE_SCENARIO
if (scenarioType === 'smoke') {
  activeScenarios = {
    smoke_test: {
      executor: 'constant-vus',
      vus: config.vus,
      duration: config.duration,
      exec: 'smoke'
    }
  };
} else if (scenarioType === 'load') {
  activeScenarios = {
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: config.rampUpDuration, target: config.vus }, // Warm-up / Ramp-up
        { duration: config.holdDuration, target: config.vus },    // Hold load
        { duration: config.rampDownDuration, target: 0 }          // Ramp-down
      ],
      gracefulRampDown: '5s',
      exec: 'load'
    }
  };
} else {
  throw new Error(
    `[Pulse Config Error] Unsupported scenario type: "${scenarioType}". Supported scenarios: smoke, load.`
  );
}

// k6 configuration options
export const options = {
  scenarios: activeScenarios,
  thresholds: {
    // Baseline validation thresholds
    http_req_failed: ['rate<0.01'],    // Fail rate must be under 1%
    http_req_duration: ['p(95)<2000']  // 95% of requests must complete under 2000ms
  },
  tags: {
    environment: config.environment,
    framework: 'pulse'
  }
};

/**
 * Dispatcher for smoke testing scenario.
 */
export function smoke() {
  runSmokeTest(config);
}

/**
 * Dispatcher for core load testing scenario.
 */
export function load() {
  runLoadTest(config);
}
