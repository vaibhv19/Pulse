// k6/config/loader.js
import { targets } from './targets.js';
import { budgets } from './budgets.js';

// Note: k6 requires the path argument of open() to be a static string literal.
const configs = {
  local: JSON.parse(open('./local.json')),
  development: JSON.parse(open('./development.json')),
  staging: JSON.parse(open('./staging.json')),
  'production-like': JSON.parse(open('./production-like.json'))
};

// Default framework configuration values
const DEFAULTS = {
  vus: 1,
  duration: '5s',
  apiVersion: 'v1',
  rampUpDuration: '5s',
  holdDuration: '10s',
  rampDownDuration: '5s',
  
  // Stress profile defaults
  stressMaxVUs: 10,
  stressStepDuration: '5s',
  stressStagesCount: 3,
  stressHoldDuration: '10s',
  stressRampDownDuration: '5s'
};

/**
 * Loads the active target and environment configuration, applying overrides.
 * 
 * Precedence Order:
 * 1. Default Framework Configuration
 * 2. Environment Profile (local.json, staging.json, etc.)
 * 3. Target Environment Configuration (from targets.js)
 * 4. Runtime Environment Overrides (__ENV)
 * 
 * Supported Env Vars:
 * - PULSE_ENV: local | development | staging | production-like (default: local)
 * - PULSE_TARGET: phoenix | trajectory (no default, must be explicitly specified)
 * - PULSE_SCENARIO: smoke | load | stress (default: load)
 * - PULSE_TARGET_URL: Overrides resolved baseUrl
 * - PULSE_VUS: Overrides VUs count
 * - PULSE_DURATION: Overrides execution duration (for smoke tests)
 * - PULSE_API_VERSION: Overrides API version
 * - PULSE_RAMP_UP: Overrides load profile ramp up duration (e.g. '5s')
 * - PULSE_HOLD: Overrides load profile hold duration (e.g. '15s')
 * - PULSE_RAMP_DOWN: Overrides load profile ramp down duration (e.g. '5s')
 * - PULSE_BUDGET_LATENCY: Overrides performance budget p95 latency limit in ms (e.g. 1000)
 * - PULSE_BUDGET_FAILURES: Overrides performance budget maximum failure rate (e.g. 0.05)
 * - PULSE_STRESS_MAX_VUS: Overrides stress testing max concurrent VUs (e.g. 20)
 * - PULSE_STRESS_STEP_DURATION: Overrides stress testing step duration (e.g. '10s')
 * - PULSE_STRESS_STAGES_COUNT: Overrides stress step stages count (e.g. 4)
 * - PULSE_STRESS_HOLD: Overrides stress hold duration (e.g. '30s')
 * - PULSE_STRESS_RAMP_DOWN: Overrides stress ramp down duration (e.g. '10s')
 */
export function getConfig() {
  const env = __ENV.PULSE_ENV || 'local';
  const target = __ENV.PULSE_TARGET;
  const scenario = __ENV.PULSE_SCENARIO || 'load';

  // 1. Validate Environment
  if (!configs[env]) {
    throw new Error(
      `[Pulse Config Error] Unsupported environment: "${env}". Supported environments: ${Object.keys(configs).join(', ')}.`
    );
  }

  // 2. Validate Target selection (must be explicit)
  if (!target) {
    throw new Error(
      `[Pulse Config Error] No API target selected. Please set the PULSE_TARGET environment variable. Supported targets: ${Object.keys(targets).join(', ')}.`
    );
  }

  if (!targets[target]) {
    throw new Error(
      `[Pulse Config Error] Unsupported target: "${target}". Supported targets: ${Object.keys(targets).join(', ')}.`
    );
  }

  const envProfile = configs[env];
  const targetRegistry = targets[target];
  const targetEnv = targetRegistry.environments[env] || {};

  // 3. Resolve configuration applying precedence rules
  const resolved = Object.assign(
    {},
    DEFAULTS,                      // 1. Default framework configuration
    envProfile,                    // 2. Environment profile JSON
    {
      environment: env,
      targetId: targetRegistry.id,
      displayName: targetRegistry.displayName,
      baseUrl: targetEnv.baseUrl,
      apiVersion: targetEnv.apiVersion || DEFAULTS.apiVersion,
      endpoints: targetRegistry.endpoints || {},
      testData: targetRegistry.testData || {}
    }                              // 3. Target-specific configuration
  );

  // 4. Runtime overrides via environment variables
  if (__ENV.PULSE_TARGET_URL) {
    resolved.baseUrl = __ENV.PULSE_TARGET_URL;
  }
  if (__ENV.PULSE_VUS) {
    resolved.vus = parseInt(__ENV.PULSE_VUS, 10);
  }
  if (__ENV.PULSE_DURATION) {
    resolved.duration = __ENV.PULSE_DURATION;
  }
  if (__ENV.PULSE_API_VERSION) {
    resolved.apiVersion = __ENV.PULSE_API_VERSION;
  }
  if (__ENV.PULSE_RAMP_UP) {
    resolved.rampUpDuration = __ENV.PULSE_RAMP_UP;
  }
  if (__ENV.PULSE_HOLD) {
    resolved.holdDuration = __ENV.PULSE_HOLD;
  }
  if (__ENV.PULSE_RAMP_DOWN) {
    resolved.rampDownDuration = __ENV.PULSE_RAMP_DOWN;
  }
  
  // Stress testing overrides
  if (__ENV.PULSE_STRESS_MAX_VUS) {
    resolved.stressMaxVUs = parseInt(__ENV.PULSE_STRESS_MAX_VUS, 10);
  }
  if (__ENV.PULSE_STRESS_STEP_DURATION) {
    resolved.stressStepDuration = __ENV.PULSE_STRESS_STEP_DURATION;
  }
  if (__ENV.PULSE_STRESS_STAGES_COUNT) {
    resolved.stressStagesCount = parseInt(__ENV.PULSE_STRESS_STAGES_COUNT, 10);
  }
  if (__ENV.PULSE_STRESS_HOLD) {
    resolved.stressHoldDuration = __ENV.PULSE_STRESS_HOLD;
  }
  if (__ENV.PULSE_STRESS_RAMP_DOWN) {
    resolved.stressRampDownDuration = __ENV.PULSE_STRESS_RAMP_DOWN;
  }

  // 5. Centralized Performance Budget Resolution
  let budget = Object.assign({}, budgets.default);
  
  const targetBudgets = budgets.targets[target];
  if (targetBudgets && targetBudgets[scenario]) {
    const scenarioBudget = targetBudgets[scenario];
    Object.assign(budget, scenarioBudget);

    // Apply environment overrides if defined
    if (scenarioBudget.environments && scenarioBudget.environments[env]) {
      Object.assign(budget, scenarioBudget.environments[env]);
    }
  }

  delete budget.environments;

  if (__ENV.PULSE_BUDGET_LATENCY) {
    budget.p95Latency = parseInt(__ENV.PULSE_BUDGET_LATENCY, 10);
  }
  if (__ENV.PULSE_BUDGET_FAILURES) {
    budget.maxFailureRate = parseFloat(__ENV.PULSE_BUDGET_FAILURES);
  }

  resolved.budget = budget;
  resolved.scenario = scenario;

  // 6. Validate Resolved Values (Fail-fast validations)
  if (resolved.vus <= 0) {
    throw new Error(`[Pulse Config Error] Invalid VUs count: ${resolved.vus}. Must be positive.`);
  }
  if (resolved.stressMaxVUs <= 0) {
    throw new Error(`[Pulse Config Error] Invalid Stress Max VUs: ${resolved.stressMaxVUs}. Must be positive.`);
  }
  if (resolved.stressStagesCount <= 0) {
    throw new Error(`[Pulse Config Error] Invalid Stress Stages Count: ${resolved.stressStagesCount}. Must be positive.`);
  }

  const durationPattern = /^\d+(s|m|h)$/;
  if (resolved.duration && !durationPattern.test(resolved.duration)) {
    throw new Error(`[Pulse Config Error] Invalid duration format: "${resolved.duration}". E.g. "5s", "1m".`);
  }
  if (resolved.stressStepDuration && !durationPattern.test(resolved.stressStepDuration)) {
    throw new Error(`[Pulse Config Error] Invalid stressStepDuration format: "${resolved.stressStepDuration}". E.g. "5s".`);
  }
  if (resolved.stressHoldDuration && !durationPattern.test(resolved.stressHoldDuration)) {
    throw new Error(`[Pulse Config Error] Invalid stressHoldDuration format: "${resolved.stressHoldDuration}". E.g. "10s".`);
  }
  if (resolved.stressRampDownDuration && !durationPattern.test(resolved.stressRampDownDuration)) {
    throw new Error(`[Pulse Config Error] Invalid stressRampDownDuration format: "${resolved.stressRampDownDuration}". E.g. "5s".`);
  }

  // Final sanity check: make sure we resolved a baseUrl
  if (!resolved.baseUrl) {
    throw new Error(
      `[Pulse Config Error] Base URL could not be resolved for environment "${env}" and target "${target}".`
    );
  }

  return resolved;
}
