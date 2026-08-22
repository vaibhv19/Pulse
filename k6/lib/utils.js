// k6/lib/utils.js

/**
 * Checks if a response status code is successful (2xx or 3xx).
 * @param {object} response - The k6 response object
 * @returns {boolean}
 */
export function isSuccess(response) {
  return response && response.status >= 200 && response.status < 400;
}

/**
 * Safely constructs a URL by joining a base URL and a path.
 * @param {string} baseUrl - Base API URL
 * @param {string} path - Endpoint path
 * @returns {string}
 */
export function buildUrl(baseUrl, path) {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const endpoint = path.startsWith('/') ? path : `/${path}`;
  return `${base}${endpoint}`;
}
