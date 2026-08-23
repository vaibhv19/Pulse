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
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)']
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
 * Writes summary.json, summary.txt, and normalized reports/last_run metadata files.
 */
export function handleSummary(data) {
  console.log(`[Pulse Performance Gate Evaluation Complete]`);
  console.log(`- Scenario Executed: ${scenarioType}`);
  console.log(`- p(95) Latency Gate: p(95) < ${config.budget.p95Latency}ms`);
  console.log(`- Request Failure Gate: Fail Rate < ${(config.budget.maxFailureRate * 100).toFixed(1)}%`);

  // Extract core performance metrics
  const totalRequests = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const throughput = data.metrics.http_reqs ? data.metrics.http_reqs.values.rate : 0;
  const totalIterations = data.metrics.iterations ? data.metrics.iterations.values.count : 0;
  const p50Latency = data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(50)'] : 0;
  const p95Latency = data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'] : 0;
  const p99Latency = data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(99)'] : 0;
  const failureRate = data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : 0;

  // Extract performance budget gates dynamically
  const gates = [];
  let allGatesPassed = true;

  if (data.metrics.http_req_failed && data.metrics.http_req_failed.thresholds) {
    const thresh = data.metrics.http_req_failed.thresholds;
    Object.keys(thresh).forEach((key) => {
      gates.push({
        name: 'http_req_failed',
        limit: key,
        actual: data.metrics.http_req_failed.values.rate,
        passed: thresh[key].ok
      });
      if (!thresh[key].ok) allGatesPassed = false;
    });
  }
  if (data.metrics.http_req_duration && data.metrics.http_req_duration.thresholds) {
    const thresh = data.metrics.http_req_duration.thresholds;
    Object.keys(thresh).forEach((key) => {
      gates.push({
        name: 'http_req_duration',
        limit: key,
        actual: data.metrics.http_req_duration.values['p(95)'],
        passed: thresh[key].ok
      });
      if (!thresh[key].ok) allGatesPassed = false;
    });
  }

  // Build normalized report JSON
  const reportJson = {
    metadata: {
      target: config.targetId,
      environment: config.environment,
      scenario: scenarioType,
      timestamp: new Date().toISOString(),
      vus: config.vus,
      duration: scenarioType === 'smoke' ? config.duration : `Ramp: ${config.rampUpDuration}, Hold: ${config.holdDuration}, Down: ${config.rampDownDuration}`
    },
    metrics: {
      totalRequests,
      totalIterations,
      p50Latency,
      p95Latency,
      p99Latency,
      failureRate,
      throughput
    },
    gates: gates,
    status: allGatesPassed ? 'PASS' : 'FAIL'
  };

  // Generate Markdown report layout
  const statusEmoji = allGatesPassed ? '✅ PASS' : '❌ FAIL';
  const reportMd = `# Pulse Performance Run Report

## 🏁 Status: ${statusEmoji}

### 📋 Metadata
- **Target:** ${config.displayName} (\`${config.targetId}\`)
- **Environment:** \`${config.environment}\`
- **Scenario:** \`${scenarioType}\`
- **Timestamp:** ${reportJson.metadata.timestamp}
- **VUs (Max):** ${config.vus}
- **Duration Configuration:** ${reportJson.metadata.duration}

### 📈 Core Performance Metrics
- **Total Requests:** ${totalRequests}
- **Throughput:** ${throughput.toFixed(2)} req/sec
- **Total Iterations:** ${totalIterations}
- **p50 (Median) Latency:** ${p50Latency.toFixed(2)} ms
- **p95 Latency:** ${p95Latency.toFixed(2)} ms
- **p99 Latency:** ${p99Latency.toFixed(2)} ms
- **Request Failure Rate:** ${(failureRate * 100).toFixed(2)}%

### 🚧 Performance Budget Gates
${gates.length === 0 ? '_No budget gates configured for this run._' : gates.map(g => {
  return `- **${g.name}** (\`${g.limit}\`): ${g.passed ? '✅ Passed' : '❌ Failed'} (Actual: ${g.name === 'http_req_failed' ? (g.actual * 100).toFixed(2) + '%' : g.actual.toFixed(2) + 'ms'})`;
}).join('\n')}
`;

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
    'summary.txt': textSummary(data, { indent: ' ', enableColors: false }),
    
    // Write normalized report structures
    'reports/last_run.json': JSON.stringify(reportJson, null, 2),
    'reports/last_run.md': reportMd
  };
}
