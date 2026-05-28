'use strict';

/**
 * Wildberries HTTP client (read-only).
 *
 * Strict security contract:
 *   - The Authorization header is added at request time from a `token` argument and is
 *     NEVER persisted on the returned object.
 *   - The token is never logged, never returned, never embedded in error messages,
 *     and never written into the response cache.
 *   - All requests are GET-only. Mutating methods are not implemented here.
 */

const DEFAULT_HOST = 'https://common-api.wildberries.ru';
const DEFAULT_TIMEOUT_MS = 10000;

function safeUrl(host, pathname) {
  const base = (host || DEFAULT_HOST).replace(/\/+$/, '');
  const tail = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${tail}`;
}

async function readBodyJsonSafe(res) {
  try {
    const text = await res.text();
    if (!text) return { json: null, raw: '' };
    try {
      return { json: JSON.parse(text), raw: text };
    } catch (_e) {
      return { json: null, raw: text };
    }
  } catch (_e) {
    return { json: null, raw: '' };
  }
}

/**
 * Issue a GET request to a WB endpoint and return a structured, secret-free result.
 *
 * @param {object} params
 * @param {string} params.host         - e.g. 'https://common-api.wildberries.ru'
 * @param {string} params.pathname     - e.g. '/ping' or '/api/v1/seller-info'
 * @param {string|null} params.token   - WB API token, or null to omit Authorization header.
 * @param {number} [params.timeoutMs]  - per-request timeout (default 10s).
 * @returns {Promise<{
 *   httpStatus: number,
 *   ok: boolean,
 *   title: string|null,
 *   detail: string|null,
 *   requestId: string|null,
 *   bodyKeys: string[]|null,
 *   sidPresent: boolean,
 *   namePresent: boolean,
 *   pingStatus: string|null,
 *   networkError: string|null,
 *   durationMs: number,
 * }>}
 */
async function wbGet({ host, pathname, token, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = safeUrl(host, pathname);
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = token;

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, { method: 'GET', headers, signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    return {
      httpStatus: 0,
      ok: false,
      title: null,
      detail: null,
      requestId: null,
      bodyKeys: null,
      sidPresent: false,
      namePresent: false,
      pingStatus: null,
      networkError: err && err.name === 'AbortError' ? 'timeout' : (err && err.code) || 'network_error',
      durationMs: Date.now() - started,
    };
  }
  clearTimeout(timer);

  const { json } = await readBodyJsonSafe(res);
  const bodyKeys = json && typeof json === 'object' ? Object.keys(json) : null;

  return {
    httpStatus: res.status,
    ok: res.ok,
    title: (json && typeof json.title === 'string') ? json.title : null,
    detail: (json && typeof json.detail === 'string') ? json.detail : null,
    requestId: (json && typeof json.requestId === 'string') ? json.requestId : null,
    bodyKeys,
    sidPresent: !!(json && typeof json.sid === 'string' && json.sid.length > 0),
    namePresent: !!(json && typeof json.name === 'string' && json.name.length > 0),
    pingStatus: (json && typeof json.Status === 'string') ? json.Status : null,
    networkError: null,
    durationMs: Date.now() - started,
  };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_TIMEOUT_MS,
  wbGet,
};
