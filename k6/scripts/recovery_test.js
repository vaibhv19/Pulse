// k6/scripts/recovery_test.js
import http from 'k6/http';
import { check } from 'k6';
import { buildUrl, isSuccess } from '../lib/utils.js';

let hasLoggedSetup = false;

/**
 * Runs a single health probe iteration against the active target to verify recovery.
 */
export function runRecoveryCheck(config) {
  if (!hasLoggedSetup) {
    console.log(`[Pulse Post-Stress Recovery Check]`);
    console.log(`- Target: ${config.displayName} (${config.targetId})`);
    console.log(`- Base URL: ${config.baseUrl}`);
    hasLoggedSetup = true;
  }

  const healthEndpoint = config.endpoints.health;
  if (!healthEndpoint) {
    throw new Error(
      `[Pulse Recovery Error] Health endpoint not defined for target "${config.targetId}".`
    );
  }

  const url = buildUrl(config.baseUrl, healthEndpoint.path);
  const res = http.request(healthEndpoint.method || 'GET', url, null, {
    tags: {
      name: `${config.targetId}-recovery-health`,
      endpoint: 'health',
      target: config.targetId,
      scenario: 'recovery_test'
    }
  });

  const success = check(res, {
    'recovery: status is successful': (r) => isSuccess(r),
    'recovery: response body is valid': (r) => r.body && r.body.length > 0
  });

  if (success) {
    console.log(`[Pulse Post-Stress Recovery Result] SUCCESS: Target recovered successfully.`);
  } else {
    console.log(`[Pulse Post-Stress Recovery Result] FAILURE: Target failed to recover. Status = ${res.status}`);
  }
}
