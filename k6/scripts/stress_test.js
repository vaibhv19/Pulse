// k6/scripts/stress_test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildUrl, isSuccess } from '../lib/utils.js';

let hasLoggedSetup = false;

/**
 * Runs a progressive stress test iteration against the active target.
 * Targets the main resource-intensive API endpoint with high throughput pacing.
 */
export function runStressTest(config) {
  if (!hasLoggedSetup) {
    console.log(`[Pulse Scenario Run - Stress Test]`);
    console.log(`- Target: ${config.displayName} (${config.targetId})`);
    console.log(`- Base URL: ${config.baseUrl}`);
    console.log(`- API Version: ${config.apiVersion}`);
    console.log(`- Target load: Max VUs = ${config.stressMaxVUs} (Steps duration: ${config.stressStepDuration}, steps: ${config.stressStagesCount})`);
    hasLoggedSetup = true;
  }

  const targetId = config.targetId;
  const endpoints = config.endpoints;

  let selectedEndpoint = null;
  let label = '';

  // Select primary resource-heavy endpoint for stress testing
  if (targetId === 'phoenix') {
    selectedEndpoint = endpoints.contacts;
    label = 'contacts';
  } else if (targetId === 'trajectory') {
    selectedEndpoint = endpoints.pi;
    label = 'pi';
  }

  if (!selectedEndpoint) {
    throw new Error(
      `[Pulse Runtime Error] Primary resource endpoint not configured in registry for target "${targetId}" to run stress tests.`
    );
  }

  const url = buildUrl(config.baseUrl, selectedEndpoint.path);
  const res = http.request(selectedEndpoint.method || 'GET', url, null, {
    tags: {
      name: `${targetId}-stress-${label}`,
      endpoint: label,
      target: targetId,
      scenario: 'stress_test'
    }
  });

  // Evaluate request status success
  check(res, {
    'stress_test: status is successful': (r) => isSuccess(r),
    'stress_test: response body is valid': (r) => r.body && r.body.length > 0
  });

  // Rapid pacing to push system bounds: short wait (100ms - 500ms)
  sleep(0.1 + Math.random() * 0.4);
}
