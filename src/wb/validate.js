'use strict';

/**
 * Wildberries token validation (Pass 3, read-only).
 *
 * The smallest valid WB-first probe sequence:
 *   1. GET <host>/ping                — connection-check; accepts a token of any category.
 *   2. GET <host>/api/v1/seller-info  — confirms token is bound to a real seller (returns `sid`).
 *
 * On sandbox hosts (`*-sandbox.wildberries.ru`) only step (1) is meaningful because
 * `common-api` has no sandbox twin (see docs/devin/WB_SANDBOX_NOTES.md).
 *
 * No state-changing requests are issued. Authorization is supplied via the
 * `Authorization: <token>` header only; the token never appears in URLs, query
 * strings, log lines, or returned objects.
 */

const { wbGet, DEFAULT_HOST } = require('./client');
const {
  classify,
  combineOverall,
  RESULT_CLASSES,
  DETAIL_CLASSES,
} = require('./classify');

const DEFAULT_PING_PATH = '/ping';
const DEFAULT_SELLER_INFO_PATH = '/api/v1/seller-info';
const DEFAULT_MASK_TAIL = 4;

const PROBE_KINDS = Object.freeze({
  NO_TOKEN:    'no_token',
  BAD_TOKEN:   'bad_token',
  VALID_TOKEN: 'valid_token',
});

/**
 * Return a safe label for any string secret. Examples:
 *   maskToken(undefined)   -> 'wb_(unset)'
 *   maskToken('')          -> 'wb_(unset)'
 *   maskToken('abcd1234')  -> 'wb_****1234'
 *   maskToken('xy', 4)     -> 'wb_(provided)' (too short to safely mask without leaking entropy)
 */
function maskToken(token, tail = DEFAULT_MASK_TAIL) {
  if (token == null || token === '') return 'wb_(unset)';
  const s = String(token);
  const n = Number.isFinite(tail) && tail > 0 ? Math.floor(tail) : DEFAULT_MASK_TAIL;
  if (s.length <= n + 4) return 'wb_(provided)';
  return `wb_****${s.slice(-n)}`;
}

function isSandboxHost(host) {
  return /-sandbox\.wildberries\.ru/i.test(host || '');
}

function detectMode({ token, host }) {
  if (!token) return 'C'; // no secret — only negative probes
  if (isSandboxHost(host)) return 'B';
  return 'A';
}

/**
 * Single probe: issue one GET request and classify the response.
 *
 * Returns a plain JSON-safe object that can be persisted or printed.
 */
async function probe({
  kind,
  host,
  pathname,
  token,
  timeoutMs,
} = {}) {
  const res = await wbGet({ host, pathname, token, timeoutMs });
  const classification = classify({
    httpStatus: res.httpStatus,
    detail: res.detail,
    title: res.title,
    networkError: res.networkError,
  });

  return {
    kind,
    pathname,
    httpStatus: res.httpStatus,
    ok: res.ok,
    title: res.title,
    detail: res.detail,
    requestId: res.requestId,
    sidPresent: res.sidPresent,
    namePresent: res.namePresent,
    pingStatus: res.pingStatus,
    bodyKeys: res.bodyKeys,
    networkError: res.networkError,
    durationMs: res.durationMs,
    classification,
  };
}

/**
 * Run the full Pass 3 probe set against `host`:
 *
 *   - no_token:  GET <host>/api/v1/seller-info  (no Authorization header)
 *                Expectation: HTTP 401, detail "empty Authorization header".
 *   - bad_token: GET <host>/api/v1/seller-info  (Authorization: x.y.z)
 *                Expectation: HTTP 401, detail starts with "access token problem; token is malformed".
 *   - valid_token (only if `token` is provided):
 *       /ping              — expect HTTP 200, Status=OK.
 *       /api/v1/seller-info — Mode A: expect HTTP 200, sid present.
 *                             Mode B (sandbox): skipped, recorded as N/A.
 *
 * @param {object} params
 * @param {string|null} params.token   - WB_API_TOKEN value (raw). Never persisted.
 * @param {string} [params.host]
 * @param {string} [params.pingPath]
 * @param {string} [params.sellerInfoPath]
 * @param {string} [params.badToken]   - non-secret literal for the bad_token negative probe.
 * @param {number} [params.maskTail]
 * @param {number} [params.timeoutMs]
 */
async function runValidation(params = {}) {
  const host = params.host || process.env.WB_API_HOST || DEFAULT_HOST;
  const pingPath = params.pingPath || process.env.WB_PING_PATH || DEFAULT_PING_PATH;
  const sellerInfoPath =
    params.sellerInfoPath || process.env.WB_SELLER_INFO_PATH || DEFAULT_SELLER_INFO_PATH;
  const badToken = params.badToken || 'x.y.z';
  const maskTail = Number(params.maskTail || process.env.WB_TOKEN_MASK_TAIL || DEFAULT_MASK_TAIL);
  const timeoutMs = Number(params.timeoutMs || process.env.WB_TIMEOUT_MS || 10000);

  // `token` defaulting rules:
  //   - if the caller explicitly passes `token: null` or `token: ''`, treat as Mode C (no secret).
  //   - if `token` is undefined (not passed at all), fall back to the env var.
  let token;
  if (Object.prototype.hasOwnProperty.call(params, 'token')) {
    token = params.token || '';
  } else {
    token = process.env.WB_API_TOKEN || '';
  }
  const mode = detectMode({ token, host });
  const tokenLabel = maskToken(token, maskTail);

  const probes = [];

  // 1. Negative — no Authorization header.
  probes.push(await probe({
    kind: PROBE_KINDS.NO_TOKEN,
    host,
    pathname: sellerInfoPath,
    token: null,
    timeoutMs,
  }));

  // 2. Negative — bogus token (literal x.y.z, NEVER from secrets).
  probes.push(await probe({
    kind: PROBE_KINDS.BAD_TOKEN,
    host,
    pathname: sellerInfoPath,
    token: badToken,
    timeoutMs,
  }));

  // 3. Positive — only if a real token is provided.
  if (token) {
    const pingProbe = await probe({
      kind: PROBE_KINDS.VALID_TOKEN,
      host,
      pathname: pingPath,
      token,
      timeoutMs,
    });
    pingProbe.subkind = 'ping';
    probes.push(pingProbe);

    if (mode === 'A') {
      const sellerInfoProbe = await probe({
        kind: PROBE_KINDS.VALID_TOKEN,
        host,
        pathname: sellerInfoPath,
        token,
        timeoutMs,
      });
      sellerInfoProbe.subkind = 'seller_info';
      probes.push(sellerInfoProbe);
    } else if (mode === 'B') {
      probes.push({
        kind: PROBE_KINDS.VALID_TOKEN,
        subkind: 'seller_info',
        pathname: sellerInfoPath,
        httpStatus: 0,
        ok: false,
        title: null,
        detail: null,
        requestId: null,
        sidPresent: false,
        namePresent: false,
        pingStatus: null,
        bodyKeys: null,
        networkError: null,
        durationMs: 0,
        skipped: true,
        skipReason: 'sandbox_host_has_no_common_api',
        classification: {
          resultClass: 'n/a',
          detailClass: 'n/a',
          terminal: false,
        },
      });
    }
  }

  const overallResultClass = computeOverallResultClass({ token, probes });
  const verdict = computeVerdict({ token, mode, probes, overallResultClass });

  return {
    finishedAt: new Date().toISOString(),
    host,
    mode,
    tokenLabel,
    overallResultClass,
    verdict,
    probes,
    config: {
      pingPath,
      sellerInfoPath,
      badToken,
      timeoutMs,
      maskTail,
    },
  };
}

/**
 * The "overall" class summarises ONLY the positive-token probes (valid_token).
 * Negative probes always produce REJECTED — folding them in would mask a real
 * upstream outage. If the validation ran in Mode C (no token) we fall back to
 * the negative probes so the caller still gets a single string.
 */
function computeOverallResultClass({ token, probes }) {
  if (token) {
    const positiveProbes = probes.filter(
      (p) => p.kind === PROBE_KINDS.VALID_TOKEN && !p.skipped,
    );
    if (positiveProbes.length === 0) return RESULT_CLASSES.UNKNOWN;
    return combineOverall(positiveProbes);
  }
  return combineOverall(probes);
}

/**
 * Convert (mode, probes, overall) into a PASS/FAIL/BLOCKED verdict per check.
 *
 *   negativeNoToken      PASS  iff resultClass == rejected && detailClass == missing_token
 *   negativeBadToken     PASS  iff resultClass == rejected && detailClass == malformed_token
 *   positivePing         PASS  iff token provided && ping resultClass == accepted
 *                         N/A  iff token absent
 *                         BLOCKED iff token provided but ping unavailable/rate_limited
 *   positiveSellerInfo   PASS  iff Mode A && seller_info resultClass == accepted && sidPresent
 *                         N/A  iff token absent OR Mode B (sandbox)
 *                         BLOCKED iff Mode A && seller_info unavailable/rate_limited
 *   overall              PASS iff all configured checks PASS
 */
function computeVerdict({ token, mode, probes, overallResultClass }) {
  const find = (kind, subkind) =>
    probes.find((p) => p.kind === kind && (subkind == null || p.subkind === subkind));

  const passOrFail = (probe, expectedDetailClass) => {
    if (!probe) return { state: 'N/A', detailClass: null };
    if (probe.skipped) return { state: 'N/A', detailClass: null, skipReason: probe.skipReason };
    const c = probe.classification || {};
    if (c.resultClass === RESULT_CLASSES.REJECTED && (!expectedDetailClass || c.detailClass === expectedDetailClass)) {
      return { state: 'PASS', detailClass: c.detailClass };
    }
    return { state: 'FAIL', detailClass: c.detailClass, resultClass: c.resultClass };
  };

  const noToken = find(PROBE_KINDS.NO_TOKEN);
  const badToken = find(PROBE_KINDS.BAD_TOKEN);
  const ping = find(PROBE_KINDS.VALID_TOKEN, 'ping');
  const sellerInfo = find(PROBE_KINDS.VALID_TOKEN, 'seller_info');

  const verdict = {
    negativeNoToken:    passOrFail(noToken, DETAIL_CLASSES.MISSING_TOKEN),
    negativeBadToken:   passOrFail(badToken, DETAIL_CLASSES.MALFORMED_TOKEN),
    positivePing:       null,
    positiveSellerInfo: null,
    overall:            null,
  };

  if (!token) {
    verdict.positivePing = { state: 'N/A', reason: 'no_token_provided_mode_C' };
    verdict.positiveSellerInfo = { state: 'N/A', reason: 'no_token_provided_mode_C' };
  } else {
    if (!ping) {
      verdict.positivePing = { state: 'N/A', reason: 'probe_not_executed' };
    } else if (ping.classification.resultClass === RESULT_CLASSES.ACCEPTED) {
      verdict.positivePing = { state: 'PASS', detailClass: ping.classification.detailClass };
    } else if (
      ping.classification.resultClass === RESULT_CLASSES.UNAVAILABLE ||
      ping.classification.resultClass === RESULT_CLASSES.RATE_LIMITED
    ) {
      verdict.positivePing = {
        state: 'BLOCKED',
        reason: ping.classification.detailClass,
        resultClass: ping.classification.resultClass,
      };
    } else {
      verdict.positivePing = {
        state: 'FAIL',
        detailClass: ping.classification.detailClass,
        resultClass: ping.classification.resultClass,
      };
    }

    if (mode === 'B') {
      verdict.positiveSellerInfo = { state: 'N/A', reason: 'sandbox_host_has_no_common_api' };
    } else if (!sellerInfo) {
      verdict.positiveSellerInfo = { state: 'N/A', reason: 'probe_not_executed' };
    } else if (sellerInfo.classification.resultClass === RESULT_CLASSES.ACCEPTED && sellerInfo.sidPresent) {
      verdict.positiveSellerInfo = { state: 'PASS', detailClass: sellerInfo.classification.detailClass };
    } else if (
      sellerInfo.classification.resultClass === RESULT_CLASSES.UNAVAILABLE ||
      sellerInfo.classification.resultClass === RESULT_CLASSES.RATE_LIMITED
    ) {
      verdict.positiveSellerInfo = {
        state: 'BLOCKED',
        reason: sellerInfo.classification.detailClass,
        resultClass: sellerInfo.classification.resultClass,
      };
    } else if (sellerInfo.classification.resultClass === RESULT_CLASSES.ACCEPTED && !sellerInfo.sidPresent) {
      verdict.positiveSellerInfo = {
        state: 'FAIL',
        detailClass: 'no_sid_in_body',
        resultClass: sellerInfo.classification.resultClass,
      };
    } else {
      verdict.positiveSellerInfo = {
        state: 'FAIL',
        detailClass: sellerInfo.classification.detailClass,
        resultClass: sellerInfo.classification.resultClass,
      };
    }
  }

  const states = [
    verdict.negativeNoToken.state,
    verdict.negativeBadToken.state,
    verdict.positivePing.state,
    verdict.positiveSellerInfo.state,
  ];
  if (states.includes('FAIL')) verdict.overall = 'FAIL';
  else if (states.includes('BLOCKED')) verdict.overall = 'BLOCKED';
  else if (states.every((s) => s === 'PASS' || s === 'N/A')) verdict.overall = states.includes('PASS') ? 'PASS' : 'N/A';
  else verdict.overall = 'UNKNOWN';

  verdict.overallResultClass = overallResultClass;
  return verdict;
}

module.exports = {
  PROBE_KINDS,
  DEFAULT_PING_PATH,
  DEFAULT_SELLER_INFO_PATH,
  DEFAULT_MASK_TAIL,
  maskToken,
  isSandboxHost,
  detectMode,
  runValidation,
  computeOverallResultClass,
  computeVerdict,
};
