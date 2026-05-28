'use strict';

/**
 * SellerNerve Pass 3 — Wildberries token validation runner (read-only).
 *
 * Usage:
 *   npm run wb:validate                       # full run (mode auto-detected from env/token)
 *   npm run wb:validate -- --no-persist       # skip DB persistence
 *   npm run wb:validate -- --host=https://content-api-sandbox.wildberries.ru
 *   npm run wb:validate -- --no-token         # force Mode C (negative probes only)
 *
 * Behaviour:
 *   - Reads WB_API_TOKEN from env. Never prints or logs the raw token.
 *   - Probes WB endpoints over HTTPS GET only (read-only).
 *   - Classifies every response into a SellerNerve result class.
 *   - Persists a `wb_token_validations` row + one `wb_token_validation_probes`
 *     row per probe (unless --no-persist or DB unconfigured).
 *   - Exits 0 if every check is PASS or PASS+N/A; exits 1 on FAIL;
 *     exits 2 on BLOCKED (e.g. upstream WB outage during the run).
 */

const { runValidation } = require('../wb/validate');
const { persistValidationResult } = require('../wb/persist');
const { runMigrations } = require('../db/migrate');
const { getPool, endPool } = require('../db/pool');

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([a-z0-9-]+)(?:=(.*))?$/i);
    if (!m) continue;
    out[m[1]] = m[2] == null ? true : m[2];
  }
  return out;
}

function exitCodeForVerdict(overall) {
  if (overall === 'PASS' || overall === 'N/A') return 0;
  if (overall === 'BLOCKED') return 2;
  return 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const noPersist = !!args['no-persist'];
  const noToken   = !!args['no-token'];
  const host      = typeof args.host === 'string' ? args.host : undefined;

  // Optional: idempotently apply migrations so the wb_* tables exist.
  let pool = null;
  if (!noPersist) {
    pool = getPool();
    if (pool) {
      await runMigrations({ logger: { info: () => {}, warn: () => {}, error: console.error } });
    }
  }

  const token = noToken ? null : (process.env.WB_API_TOKEN || null);
  const result = await runValidation({ token, host });

  let persistence = { persisted: false, reason: 'skipped' };
  if (!noPersist) {
    try {
      persistence = await persistValidationResult({ result, pool });
    } catch (err) {
      persistence = { persisted: false, reason: `error: ${err.message}` };
    }
  }

  const report = {
    pass: 3,
    finishedAt: result.finishedAt,
    host: result.host,
    mode: result.mode,
    tokenLabel: result.tokenLabel,
    overallResultClass: result.overallResultClass,
    verdict: result.verdict,
    persistence,
    probes: result.probes.map((p) => ({
      kind: p.kind,
      subkind: p.subkind || null,
      pathname: p.pathname,
      httpStatus: p.httpStatus,
      durationMs: p.durationMs,
      resultClass: p.classification && p.classification.resultClass,
      detailClass: p.classification && p.classification.detailClass,
      title: p.title,
      detail: p.detail,
      requestId: p.requestId,
      sidPresent: !!p.sidPresent,
      namePresent: !!p.namePresent,
      pingStatus: p.pingStatus,
      bodyKeys: p.bodyKeys,
      networkError: p.networkError,
      skipped: !!p.skipped,
      skipReason: p.skipReason || null,
    })),
    statement: 'Secrets were not exposed.',
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return exitCodeForVerdict(result.verdict && result.verdict.overall);
}

main()
  .then((code) => {
    endPool().catch(() => {}).finally(() => process.exit(code));
  })
  .catch((err) => {
    console.error('[error] wb-validate failed:', err && err.message);
    endPool().catch(() => {}).finally(() => process.exit(1));
  });
