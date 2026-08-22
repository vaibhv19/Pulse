// k6/config/loader.js
// Note: k6 requires the path argument of open() to be a static string literal.
// We cannot dynamically construct paths like open(`./${env}.json`).
const configs = {
  local: JSON.parse(open('./local.json')),
  development: JSON.parse(open('./development.json')),
  staging: JSON.parse(open('./staging.json')),
  'production-like': JSON.parse(open('./production-like.json'))
};

/**
 * Loads the active environment configuration, applying overrides from environment variables.
 * 
 * Supported env vars:
 * - PULSE_ENV: local | development | staging | production-like (default: local)
 * - PULSE_TARGET_URL: Overrides the target API URL
 * - PULSE_VUS: Overrides the virtual user count
 * - PULSE_DURATION: Overrides the test run duration
 */
export function getConfig() {
  const env = __ENV.PULSE_ENV || 'local';
  
  if (!configs[env]) {
    throw new Error(
      `Unknown environment: "${env}". Supported environments: local, development, staging, production-like.`
    );
  }

  // Clone config to prevent mutations across calls
  const config = JSON.parse(JSON.stringify(configs[env]));

  // Apply environment variable overrides if provided
  if (__ENV.PULSE_TARGET_URL) {
    config.targetUrl = __ENV.PULSE_TARGET_URL;
  }
  if (__ENV.PULSE_VUS) {
    config.vus = parseInt(__ENV.PULSE_VUS, 10);
  }
  if (__ENV.PULSE_DURATION) {
    config.duration = __ENV.PULSE_DURATION;
  }

  return config;
}
