// k6/main.js
import { getConfig } from './config/loader.js';
import { runSmokeTest } from './scripts/smoke_test.js';
import { runLoadTest } from './scripts/load_test.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const config = getConfig();
const scenarioType = config.scenario;

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
    // Dynamic Performance Budget Thresholds
    http_req_failed: [`rate<${config.budget.maxFailureRate}`],      // e.g. rate < 0.01
    http_req_duration: [`p(95)<${config.budget.p95Latency}`]         // e.g. p(95) < 1500
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

/**
 * Hook to export execution summaries to working directory.
 * Writes summary.json and summary.txt, and displays standard text output in stdout.
 */
export function handleSummary(data) {
  console.log(`[Pulse Performance Gate Evaluation Complete]`);
  console.log(`- p(95) Latency Gate: p(95) < ${config.budget.p95Latency}ms`);
  console.log(`- Request Failure Gate: Fail Rate < ${(config.budget.maxFailureRate * 100).toFixed(1)}%`);

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
    'summary.txt': textSummary(data, { indent: ' ', enableColors: false })
  };
}
