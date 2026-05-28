'use strict';

/**
 * Wildberries response classifier.
 *
 * Maps an observed (httpStatus, detailString) pair into:
 *   - resultClass:  one of the canonical outcome buckets the rest of SellerNerve uses:
 *                     accepted | rejected | unavailable | rate_limited | unknown_error
 *   - detailClass:  the finer-grained WB error class described in
 *                     docs/devin/WB_API_PROOF_PLAN.md §5
 *
 * No raw token, no Authorization header, and no header value of any kind ever flows
 * through this module. It only operates on values returned by Wildberries itself
 * (HTTP status + the JSON `detail` field) which are documented and safe to log.
 */

const RESULT_CLASSES = Object.freeze({
  ACCEPTED:     'accepted',
  REJECTED:     'rejected',
  UNAVAILABLE:  'unavailable',
  RATE_LIMITED: 'rate_limited',
  UNKNOWN:      'unknown_error',
});

const DETAIL_CLASSES = Object.freeze({
  OK:                       'ok',
  MISSING_TOKEN:            'missing_token',
  MALFORMED_TOKEN:          'malformed_token',
  EXPIRED_TOKEN:            'expired_token',
  TAMPERED_TOKEN:           'tampered_token',
  WRONG_SCOPE:              'wrong_scope',
  UNAUTHORIZED_OTHER:       'unauthorized_other',
  SERVICE_PAYMENT_REQUIRED: 'service_payment_required',
  ACCESS_DENIED:            'access_denied',
  RATE_LIMITED:             'rate_limited',
  WB_OUTAGE:                'wb_outage',
  NETWORK_ERROR:            'network_error',
  UNKNOWN:                  'unknown',
});

function lc(s) {
  return (s == null ? '' : String(s)).toLowerCase();
}

/**
 * @param {object} params
 * @param {number|null} params.httpStatus  - 0 if a transport/network error occurred.
 * @param {string|null} params.detail      - WB JSON `detail` field, may be null.
 * @param {string|null} params.title       - WB JSON `title` field, may be null.
 * @param {string|null} params.networkError- error code from fetch/AbortController, may be null.
 * @returns {{ resultClass: string, detailClass: string, terminal: boolean }}
 *   `terminal` means the classifier is confident enough to stop probing further endpoints
 *   (e.g. rate_limited stops the chain; an accepted /ping still wants to try /seller-info).
 */
function classify({ httpStatus, detail, title, networkError } = {}) {
  if (networkError) {
    return {
      resultClass: RESULT_CLASSES.UNAVAILABLE,
      detailClass: DETAIL_CLASSES.NETWORK_ERROR,
      terminal: true,
    };
  }

  const s = Number(httpStatus) || 0;
  const d = lc(detail);
  const t = lc(title);

  if (s >= 200 && s < 300) {
    return {
      resultClass: RESULT_CLASSES.ACCEPTED,
      detailClass: DETAIL_CLASSES.OK,
      terminal: false,
    };
  }

  if (s === 429) {
    return {
      resultClass: RESULT_CLASSES.RATE_LIMITED,
      detailClass: DETAIL_CLASSES.RATE_LIMITED,
      terminal: true,
    };
  }

  if (s >= 500) {
    return {
      resultClass: RESULT_CLASSES.UNAVAILABLE,
      detailClass: DETAIL_CLASSES.WB_OUTAGE,
      terminal: true,
    };
  }

  if (s === 402) {
    return {
      resultClass: RESULT_CLASSES.REJECTED,
      detailClass: DETAIL_CLASSES.SERVICE_PAYMENT_REQUIRED,
      terminal: true,
    };
  }

  if (s === 403) {
    return {
      resultClass: RESULT_CLASSES.REJECTED,
      detailClass: DETAIL_CLASSES.ACCESS_DENIED,
      terminal: true,
    };
  }

  if (s === 401) {
    if (d.includes('empty authorization header')) {
      return {
        resultClass: RESULT_CLASSES.REJECTED,
        detailClass: DETAIL_CLASSES.MISSING_TOKEN,
        terminal: true,
      };
    }
    if (d.includes('token is malformed') || d.includes('invalid number of segments')) {
      return {
        resultClass: RESULT_CLASSES.REJECTED,
        detailClass: DETAIL_CLASSES.MALFORMED_TOKEN,
        terminal: true,
      };
    }
    if (d.includes('token is expired') || d.includes('expired')) {
      return {
        resultClass: RESULT_CLASSES.REJECTED,
        detailClass: DETAIL_CLASSES.EXPIRED_TOKEN,
        terminal: true,
      };
    }
    if (d.includes('signature is invalid') || d.includes('signing method')) {
      return {
        resultClass: RESULT_CLASSES.REJECTED,
        detailClass: DETAIL_CLASSES.TAMPERED_TOKEN,
        terminal: true,
      };
    }
    if (
      d.includes('token category') ||
      d.includes('access denied to the requested api') ||
      d.includes('wrong category') ||
      t.includes('forbidden')
    ) {
      return {
        resultClass: RESULT_CLASSES.REJECTED,
        detailClass: DETAIL_CLASSES.WRONG_SCOPE,
        terminal: true,
      };
    }
    return {
      resultClass: RESULT_CLASSES.REJECTED,
      detailClass: DETAIL_CLASSES.UNAUTHORIZED_OTHER,
      terminal: true,
    };
  }

  return {
    resultClass: RESULT_CLASSES.UNKNOWN,
    detailClass: DETAIL_CLASSES.UNKNOWN,
    terminal: true,
  };
}

/**
 * Combine the per-probe classifications into one overall outcome.
 * The overall result is the worst (most restrictive) bucket observed.
 *
 * Priority (highest wins): unavailable > rate_limited > rejected > unknown_error > accepted.
 */
function combineOverall(probes) {
  const priority = {
    [RESULT_CLASSES.UNAVAILABLE]:  5,
    [RESULT_CLASSES.RATE_LIMITED]: 4,
    [RESULT_CLASSES.REJECTED]:     3,
    [RESULT_CLASSES.UNKNOWN]:      2,
    [RESULT_CLASSES.ACCEPTED]:     1,
  };

  let best = null;
  let bestScore = -1;
  for (const p of probes) {
    if (!p || !p.classification) continue;
    const score = priority[p.classification.resultClass];
    if (score == null) continue;
    if (score > bestScore) {
      bestScore = score;
      best = p.classification.resultClass;
    }
  }
  return best || RESULT_CLASSES.UNKNOWN;
}

module.exports = {
  RESULT_CLASSES,
  DETAIL_CLASSES,
  classify,
  combineOverall,
};
