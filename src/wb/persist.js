'use strict';

/**
 * Persist a WB validation result into Postgres.
 *
 * Storage contract:
 *   - We persist outcomes of a validation run, NOT secrets.
 *   - `token_masked` contains the safe label (e.g. `wb_****abcd`); raw tokens never enter
 *     any column.
 *   - Each probe row stores HTTP status, classified result/detail, WB `requestId`, and the
 *     RAW WB `detail` string. The WB error envelope is documented and contains no secret
 *     material, so storing it is safe and useful for support.
 */

const { getPool } = require('../db/pool');

const PROBES_PER_RUN_MAX = 16;

/**
 * @param {object} params
 * @param {object} params.result   - return value of runValidation()
 * @returns {Promise<{ runId: string|null, probeIds: string[], persisted: boolean, reason?: string }>}
 */
async function persistValidationResult({ result, pool } = {}) {
  const p = pool || getPool();
  if (!p) {
    return { runId: null, probeIds: [], persisted: false, reason: 'no_db' };
  }

  if (!result || !result.probes) {
    return { runId: null, probeIds: [], persisted: false, reason: 'no_result' };
  }

  if (result.probes.length > PROBES_PER_RUN_MAX) {
    return { runId: null, probeIds: [], persisted: false, reason: 'too_many_probes' };
  }

  const client = await p.connect();
  try {
    await client.query('BEGIN');

    const runIns = await client.query(
      `INSERT INTO wb_token_validations
         (host, mode, token_masked, overall_result_class, verdict_overall, verdict, config)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       RETURNING id`,
      [
        result.host,
        result.mode,
        result.tokenLabel,
        result.overallResultClass,
        result.verdict && result.verdict.overall,
        JSON.stringify(result.verdict || {}),
        JSON.stringify(result.config || {}),
      ],
    );
    const runId = runIns.rows[0].id;

    const probeIds = [];
    for (const probe of result.probes) {
      const probeIns = await client.query(
        `INSERT INTO wb_token_validation_probes
           (run_id, kind, subkind, pathname, http_status, result_class, detail_class,
            detail, title, request_id, sid_present, name_present, ping_status,
            network_error, duration_ms, skipped, skip_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          runId,
          probe.kind,
          probe.subkind || null,
          probe.pathname,
          probe.httpStatus || 0,
          probe.classification && probe.classification.resultClass,
          probe.classification && probe.classification.detailClass,
          probe.detail,
          probe.title,
          probe.requestId,
          !!probe.sidPresent,
          !!probe.namePresent,
          probe.pingStatus,
          probe.networkError,
          probe.durationMs || 0,
          !!probe.skipped,
          probe.skipReason || null,
        ],
      );
      probeIds.push(probeIns.rows[0].id);
    }

    await client.query('COMMIT');
    return { runId, probeIds, persisted: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { persistValidationResult, PROBES_PER_RUN_MAX };
