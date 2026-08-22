// k6/main.js
import { getConfig } from './config/loader.js';
import { runSmokeTest } from './scripts/smoke_test.js';
import { runLoadTest } from './scripts/load_test.js';
import { runStressTest } from './scripts/stress_test.js';
import { runRecoveryCheck } from './scripts/recovery_test.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const config = getConfig();
const scenarioType = config.scenario;

let activeScenarios = {};

/**
 * Utility to parse duration strings (e.g. '5s', '2m') to numerical seconds.
 */
function parseDurationToSeconds(durationStr) {
  const match = durationStr.match(/^(\d+)(s|m|h)$/);
  if (!match) return 5;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return value;
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  return value;
}

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
} else if (scenarioType === 'stress') {
  // 1. Build escalating steps stages
  const stages = [];
  const stepDurationSec = parseDurationToSeconds(config.stressStepDuration);
  
  for (let i = 1; i <= config.stressStagesCount; i++) {
    const target = Math.round((config.stressMaxVUs / config.stressStagesCount) * i);
    stages.push({ duration: config.stressStepDuration, target: target });
  }
  
  // 2. Add max VUs hold stage
  stages.push({ duration: config.stressHoldDuration, target: config.stressMaxVUs });
  
  // 3. Add ramp down stage
  stages.push({ duration: config.stressRampDownDuration, target: 0 });

  // 4. Calculate total stress test duration to delay recovery execution start time
  const totalStressSeconds = 
    (stepDurationSec * config.stressStagesCount) + 
    parseDurationToSeconds(config.stressHoldDuration) + 
    parseDurationToSeconds(config.stressRampDownDuration);

  activeScenarios = {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stages,
      gracefulRampDown: '5s',
      exec: 'stress'
    },
    recovery_test: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10s',
      startTime: `${totalStressSeconds}s`,
      exec: 'recovery'
    }
  };
} else {
  throw new Error(
    `[Pulse Config Error] Unsupported scenario type: "${scenarioType}". Supported scenarios: smoke, load, stress.`
  );
}

// k6 configuration options
export const options = {
  scenarios: activeScenarios,
  thresholds: {
    // Dynamic Performance Budget Thresholds (Scenario specific)
    http_req_failed: [`rate<${config.budget.maxFailureRate}`],
    http_req_duration: [`p(95)<${config.budget.p95Latency}`]
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
 * Dispatcher for escalating stress testing scenario.
 */
export function stress() {
  runStressTest(config);
}

/**
 * Dispatcher for post-stress resilience checking scenario.
 */
export function recovery() {
  runRecoveryCheck(config);
}

/**
 * Hook to export execution summaries to working directory.
 * Writes summary.json and summary.txt, and displays standard text output in stdout.
 */
export function handleSummary(data) {
  console.log(`[Pulse Performance Gate Evaluation Complete]`);
  console.log(`- Scenario Executed: ${scenarioType}`);
  console.log(`- p(95) Latency Gate: p(95) < ${config.budget.p95Latency}ms`);
  console.log(`- Request Failure Gate: Fail Rate < ${(config.budget.maxFailureRate * 100).toFixed(1)}%`);

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
    'summary.txt': textSummary(data, { indent: ' ', enableColors: false })
  };
}
