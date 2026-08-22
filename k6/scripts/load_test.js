// k6/scripts/load_test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildUrl, isSuccess } from '../lib/utils.js';

let hasLoggedSetup = false;

/**
 * Executes a single load test iteration against the resolved target API configuration.
 * Probabilistically distributes traffic between endpoints (40% health check, 60% resources).
 * 
 * @param {object} config - Resolved configuration from loader.js
 */
export function runLoadTest(config) {
  // Log scenario info exactly once during setup
  if (!hasLoggedSetup) {
    console.log(`[Pulse Scenario Run - Load Test]`);
    console.log(`- Target: ${config.displayName} (${config.targetId})`);
    console.log(`- Base URL: ${config.baseUrl}`);
    console.log(`- API Version: ${config.apiVersion}`);
    console.log(`- Load Profile: Max VUs = ${config.vus} (Ramp Up: ${config.rampUpDuration}, Hold: ${config.holdDuration}, Ramp Down: ${config.rampDownDuration})`);
    hasLoggedSetup = true;
  }

  const targetId = config.targetId;
  const endpoints = config.endpoints;

  let selectedEndpoint = null;
  let label = '';

  const rand = Math.random();
  if (rand < 0.40) {
    selectedEndpoint = endpoints.health;
    label = 'health';
  } else {
    if (targetId === 'phoenix') {
      selectedEndpoint = endpoints.contacts;
      label = 'contacts';
    } else if (targetId === 'trajectory') {
      selectedEndpoint = endpoints.pi;
      label = 'pi';
    }
  }

  if (!selectedEndpoint) {
    throw new Error(
      `[Pulse Runtime Error] Endpoint "${label}" not configured in registry for target "${targetId}".`
    );
  }

  const url = buildUrl(config.baseUrl, selectedEndpoint.path);
  
  const res = http.request(selectedEndpoint.method, url, null, {
    tags: {
      name: `${targetId}-${label}`,
      endpoint: label,
      target: targetId,
      scenario: 'load_test'
    }
  });

  check(res, {
    'load_test: status is successful': (r) => isSuccess(r),
    'load_test: response body is valid': (r) => r.body && r.body.length > 0
  });

  // Pacing: Sleep between 0.5 and 1.5 seconds to simulate real-world pacing
  sleep(0.5 + Math.random());
}
