// k6/scripts/smoke_test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildUrl, isSuccess } from '../lib/utils.js';

/**
 * Executes a single smoke test iteration against the target base URL.
 * 
 * @param {object} config - Resolved application configuration
 */
export function runSmokeTest(config) {
  const url = buildUrl(config.targetUrl, '/');
  
  const res = http.get(url, {
    tags: { name: 'SmokeTestRoot' }
  });

  check(res, {
    'smoke_test: status is successful': (r) => isSuccess(r),
    'smoke_test: duration is under 2s': (r) => r.timings.duration < 2000
  });

  sleep(1);
}
