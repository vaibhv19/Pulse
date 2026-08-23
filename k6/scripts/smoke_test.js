// k6/scripts/smoke_test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildUrl, isSuccess } from '../lib/utils.js';

let hasLoggedSetup = false;

/**
 * Executes a single smoke test iteration against the resolved target API configuration.
 * 
 * @param {object} config - Resolved configuration from loader.js
 */
export function runSmokeTest(config) {
  // Log setup parameters exactly once at scenario launch
  if (!hasLoggedSetup) {
    console.log(`[Pulse Scenario Run]`);
    console.log(`- Target: ${config.displayName} (${config.targetId})`);
    console.log(`- Base URL: ${config.baseUrl}`);
    console.log(`- API Version: ${config.apiVersion}`);
    console.log(`- Load Profile: ${config.vus} VUs for ${config.duration}`);
    console.log(`- Sample Test Data - User ID: ${config.testData.sampleUserId || 'N/A'}`);
    hasLoggedSetup = true;
  }

  const healthEndpoint = config.endpoints.health;
  if (!healthEndpoint) {
    throw new Error(
      `[Pulse Runtime Error] "health" endpoint not defined in catalog for target "${config.targetId}".`
    );
  }

  const url = buildUrl(config.baseUrl, healthEndpoint.path);
  
  const res = http.request(healthEndpoint.method, url, null, {
    tags: {
      name: `${config.targetId}-smoke-health`,
      endpoint: 'health',
      target: config.targetId,
      scenario: 'smoke_test'
    }
  });

  check(res, {
    'smoke_test: status is successful': (r) => isSuccess(r),
    'smoke_test: response body is valid': (r) => r.body && r.body.length > 0
  });

  sleep(1);
}
