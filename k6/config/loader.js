// k6/config/loader.js
import { targets } from './targets.js';

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
  apiVersion: 'v1'
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
 * - PULSE_TARGET_URL: Overrides resolved baseUrl
 * - PULSE_VUS: Overrides VUs count
 * - PULSE_DURATION: Overrides execution duration
 * - PULSE_API_VERSION: Overrides API version
 */
export function getConfig() {
  const env = __ENV.PULSE_ENV || 'local';
  const target = __ENV.PULSE_TARGET;

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

  // Final sanity check: make sure we resolved a baseUrl
  if (!resolved.baseUrl) {
    throw new Error(
      `[Pulse Config Error] Base URL could not be resolved for environment "${env}" and target "${target}".`
    );
  }

  return resolved;
}
