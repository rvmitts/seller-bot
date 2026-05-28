# SellerNerve Devin Pass 3 Report — Wildberries Token Validation Proof

Date: 2026-05-24
Executor: Devin.ai
Branch: `devin/1779602449-pass-3-wb-validation`
Builds on: Pass 1 (API + Postgres health) and Pass 2 (Telegram send + callback loop).

`Secrets were not exposed.`

---

## 1. Scope completed

- [x] Implemented the smallest WB-first token validation path.
- [x] First WB surface used is `common-api.wildberries.ru` (`/ping` and `/api/v1/seller-info`) per `docs/devin/WB_API_PROOF_PLAN.md`.
- [x] Valid token probed live (`WB_API_TOKEN` from environment) — captured PASS evidence.
- [x] Invalid token probed using a deliberately fake value **generated in code** (`x.y.z` for the default negative probe; `deadbeef.deadbeef.deadbeef` for the extra "fake-token-via-env" run) — never from secrets.
- [x] Responses classified into the five canonical buckets: `accepted` / `rejected` / `unavailable` / `rate_limited` / `unknown_error` plus a fine-grained WB error class (`missing_token`, `malformed_token`, `expired_token`, `tampered_token`, `wrong_scope`, `unauthorized_other`, `service_payment_required`, `access_denied`, `rate_limited`, `wb_outage`, `network_error`, `ok`, `unknown`).
- [x] Validation result persisted in Postgres via a new migration `src/db/migrations/002_wb_token_validations.sql` (two new tables; no changes to existing schema).
- [x] Safe local command: `npm run wb:validate` (also `npm run wb:validate -- --no-token` for Mode C dry runs).
- [x] All requests are GET-only. **No destructive WB API calls.**
- [x] Token value never appears in any code, log, persistence row, or report. Only `wb_****<last4>` and `wb_(unset)` labels are surfaced.

## 2. Files changed in Pass 3

```text
.env.example.sellernerve                       # added optional WB_API_HOST / WB_PING_PATH / WB_SELLER_INFO_PATH / WB_TIMEOUT_MS / WB_TOKEN_MASK_TAIL knobs
package.json                                   # added "wb:validate" script
src/db/migrations/002_wb_token_validations.sql # NEW — wb_token_validations + wb_token_validation_probes
src/wb/classify.js                             # NEW — classifier (httpStatus, detail) → (resultClass, detailClass)
src/wb/client.js                               # NEW — read-only GET client (Authorization header in-request only, never logged)
src/wb/validate.js                             # NEW — runValidation() + verdict computation + token masking
src/wb/persist.js                              # NEW — persist a validation run + per-probe rows
src/scripts/wb-validate.js                     # NEW — CLI used by `npm run wb:validate`
docs/devin/PASS_3_WB_TOKEN_REPORT.md           # NEW — this report
docs/devin/ACCEPTANCE_CHECKLIST.md             # updated — Pass 3 items checked off
```

No file under `src/telegram/`, `src/db/migrations/001_*`, `src/server.js`, or `src/scripts/send-test-alert.js` was modified by Pass 3.

## 3. Architecture

```
src/scripts/wb-validate.js
   └── src/wb/validate.js
         ├── src/wb/client.js     (fetch-based GET; per-request Authorization; never persisted)
         ├── src/wb/classify.js   ((httpStatus, detail) → (resultClass, detailClass))
         └── src/wb/persist.js    (write run + probe rows; never writes the raw token)
```

The Telegram path (`src/telegram/*`) and health endpoints (`src/server.js`) are untouched by Pass 3.

### 3.1 Token-handling contract (`src/wb/client.js`, `src/wb/validate.js`)

- `WB_API_TOKEN` is read from `process.env` exactly once per validation run.
- The token is attached to the outbound HTTPS request as `Authorization: <token>` and is **never** embedded in any URL, log line, error message, persistence row, or returned object.
- A `maskToken(...)` helper produces the only sanctioned reference: `wb_****<last4>` (or `wb_(unset)` if no token, or `wb_(provided)` if the raw token is too short to mask safely without leaking entropy).
- WB returns a documented JSON envelope (`title`, `detail`, `code`, `requestId`, `origin`, `status`, `statusText`, `timestamp`) for every error response. Those values contain no secret material and are stored verbatim for support / classification.

### 3.2 Classifier (`src/wb/classify.js`)

Per `docs/devin/WB_API_PROOF_PLAN.md` §5, the classifier maps `(httpStatus, detail)` into:

| WB observation                                                  | `resultClass`   | `detailClass`              |
|-----------------------------------------------------------------|-----------------|----------------------------|
| 2xx                                                             | `accepted`      | `ok`                       |
| 401 detail `empty Authorization header`                         | `rejected`      | `missing_token`            |
| 401 detail `token is malformed` / `invalid number of segments`  | `rejected`      | `malformed_token`          |
| 401 detail `token is expired` / `expired`                       | `rejected`      | `expired_token`            |
| 401 detail `signature is invalid` / `signing method`            | `rejected`      | `tampered_token`           |
| 401 detail `token category` / `access denied to the requested API` | `rejected`   | `wrong_scope`              |
| 401 other                                                       | `rejected`      | `unauthorized_other`       |
| 402                                                             | `rejected`      | `service_payment_required` |
| 403                                                             | `rejected`      | `access_denied`            |
| 429                                                             | `rate_limited`  | `rate_limited`             |
| 5xx                                                             | `unavailable`   | `wb_outage`                |
| transport / fetch error                                         | `unavailable`   | `network_error`            |
| anything else                                                   | `unknown_error` | `unknown`                  |

### 3.3 Verdict computation (`src/wb/validate.js`)

| Verdict slot         | PASS criterion                                                                 |
|----------------------|--------------------------------------------------------------------------------|
| `negativeNoToken`    | `resultClass == rejected` AND `detailClass == missing_token`                   |
| `negativeBadToken`   | `resultClass == rejected` AND `detailClass == malformed_token`                 |
| `positivePing`       | token provided AND `resultClass == accepted`                                   |
| `positiveSellerInfo` | Mode A AND `resultClass == accepted` AND `sid_present == true`                 |
| `overall`            | `PASS` iff every slot is `PASS` or `N/A`; `BLOCKED` if any slot is rate-limited or upstream-unavailable; else `FAIL` |

### 3.4 Persistence schema (`002_wb_token_validations.sql`)

Two new tables. Both use `IF NOT EXISTS` so the migration is safe to re-run.

```sql
CREATE TABLE IF NOT EXISTS wb_token_validations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host                  text NOT NULL,
  mode                  text NOT NULL,          -- A | B | C
  token_masked          text NOT NULL,          -- 'wb_****<last4>' / 'wb_(unset)' / 'wb_(provided)'
  overall_result_class  text NOT NULL,          -- accepted | rejected | unavailable | rate_limited | unknown_error
  verdict_overall       text,                   -- PASS | FAIL | BLOCKED | N/A | UNKNOWN
  verdict               jsonb NOT NULL DEFAULT '{}'::jsonb,
  config                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wb_token_validation_probes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES wb_token_validations(id) ON DELETE CASCADE,
  kind          text NOT NULL,                   -- no_token | bad_token | valid_token
  subkind       text,                            -- ping | seller_info | null
  pathname      text NOT NULL,                   -- '/ping' or '/api/v1/seller-info'
  http_status   int  NOT NULL DEFAULT 0,         -- 0 == transport error (network_error)
  result_class  text,
  detail_class  text,
  detail        text,                            -- raw WB detail string (no secret material)
  title         text,
  request_id    text,                            -- WB requestId, for support
  sid_present   boolean NOT NULL DEFAULT false,
  name_present  boolean NOT NULL DEFAULT false,
  ping_status   text,                            -- e.g. 'OK' from /ping body
  network_error text,
  duration_ms   int NOT NULL DEFAULT 0,
  skipped       boolean NOT NULL DEFAULT false,
  skip_reason   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

The raw WB token is **not** a column anywhere in the schema. Only the masked label is stored.

## 4. Commands run

```bash
# 0. Postgres up (Pass 1 infra; unchanged).
docker compose -f docker-compose.yml up -d db
# Wait for healthy:
for i in $(seq 1 15); do s=$(docker inspect -f '{{.State.Health.Status}}' sellernerve-db); echo "t+${i}s: $s"; [ "$s" = "healthy" ] && break; sleep 1; done

# 1. Install deps (Pass 1 already installed express + pg; no new deps in Pass 3).
npm install

# 2. Smallest validation command (uses WB_API_TOKEN from env when present).
#    Token value is never echoed. The script prints a masked label only.
DATABASE_URL='postgresql://sellernerve:sellernerve@127.0.0.1:5432/sellernerve' \
  npm run wb:validate

# 3. Explicit Mode C (no secret required) — for CI / pre-credential dry runs.
DATABASE_URL='postgresql://sellernerve:sellernerve@127.0.0.1:5432/sellernerve' \
  npm run wb:validate -- --no-token

# 4. Deliberately-fake-token-via-env path (token generated in code; not a real secret).
DATABASE_URL='postgresql://sellernerve:sellernerve@127.0.0.1:5432/sellernerve' \
  WB_API_TOKEN='deadbeef.deadbeef.deadbeef' \
  npm run wb:validate
```

`docker compose down` stops Postgres; `docker compose down -v` also drops the dev volume.

## 5. Live PASS / FAIL / BLOCKED evidence

Five runs were executed in this session. All values below were captured live; the raw token never appears. All evidence is also persisted in Postgres for re-inspection (see §6).

### 5.1 Run `89f1b5f0` — Mode A (live `WB_API_TOKEN`) — **PASS**

```text
host=https://common-api.wildberries.ru  mode=A  token=wb_****MIkg

Probe                          HTTP  resultClass    detailClass        sid  WB requestId
-----------------------------  ----  -------------  -----------------  ---  ----------------------------------
no_token   /api/v1/seller-info  401  rejected       missing_token      -    1962d581f1653e1cffd53a7b2d62cbfc
bad_token  /api/v1/seller-info  401  rejected       malformed_token    -    ca439a3667f1be8141ed961533bca5cd
valid_tok  /ping                200  accepted       ok                 -    (no requestId on 200)
valid_tok  /api/v1/seller-info  200  accepted       ok                 ✓    (no requestId on 200)

verdict.negativeNoToken    = PASS  (missing_token)
verdict.negativeBadToken   = PASS  (malformed_token)
verdict.positivePing       = PASS
verdict.positiveSellerInfo = PASS  (sid_present=true)
verdict.overall            = PASS
overall_result_class       = accepted
```

This is the canonical "valid WB token accepted" PASS.

### 5.2 Run `87985036` — Mode C (`--no-token`) — **PASS**

```text
host=https://common-api.wildberries.ru  mode=C  token=wb_(unset)

Probe                          HTTP  resultClass    detailClass        WB requestId
-----------------------------  ----  -------------  -----------------  ----------------------------------
no_token   /api/v1/seller-info  401  rejected       missing_token      b6c6d2570666d7d5a2a352ee88404c33
bad_token  /api/v1/seller-info  401  rejected       malformed_token    024b1257fa7c051ecf162ac9adb0893c

verdict.negativeNoToken    = PASS
verdict.negativeBadToken   = PASS
verdict.positivePing       = N/A  (no_token_provided_mode_C)
verdict.positiveSellerInfo = N/A  (no_token_provided_mode_C)
verdict.overall            = PASS
overall_result_class       = rejected   (no positive probes to summarise; reflects negative-probe outcome)
```

Mode C demonstrates the same classifier wiring without consuming the WB token's rate budget. `overall_result_class=rejected` here is honest — it reports the WB outcome we exercised, which was rejection of probes without/with a bogus token.

### 5.3 Run `85ad8add` — Mode A with **deliberately fake token** `deadbeef.deadbeef.deadbeef` — invalid-token rejection PASS

```text
host=https://common-api.wildberries.ru  mode=A  token=wb_****beef  (deliberately fake; generated in code)

Probe                          HTTP  resultClass    detailClass        WB requestId
-----------------------------  ----  -------------  -----------------  ----------------------------------
no_token   /api/v1/seller-info  401  rejected       missing_token      1909ebf24260a0b294887f4f88039187
bad_token  /api/v1/seller-info  401  rejected       malformed_token    37623d091e16deb1d81d5f169f6d3b10
valid_tok  /ping                401  rejected       malformed_token    69ddb194d8547d53712adcd3dc2e850e
valid_tok  /api/v1/seller-info  401  rejected       malformed_token    65712cddda91bc08ca488f65266ff5af

verdict.negativeNoToken    = PASS
verdict.negativeBadToken   = PASS
verdict.positivePing       = FAIL  (rejected/malformed_token)
verdict.positiveSellerInfo = FAIL  (rejected/malformed_token)
verdict.overall            = FAIL   (this is the expected verdict — we deliberately fed an invalid token)
overall_result_class       = rejected
```

Interpretation: the runner did not know the token was fake, so it reported `verdict.overall=FAIL` for the positive checks. That is *exactly* the desired behaviour for "invalid WB token rejection": the classifier put the response in the `rejected/malformed_token` bucket, which is the documented WB reject envelope. From the user prompt's perspective ("invalid WB token rejection PASS"), this run produces the evidence required: a non-`x.y.z` deliberately-fake token, sent live to WB, was rejected with the correct class — PASS for the "invalid token is cleanly rejected" criterion.

### 5.4 Runs `c24d5765` and `ba41d7e8` — Mode A re-runs — **BLOCKED (rate_limited)**

```text
host=https://common-api.wildberries.ru  mode=A  token=wb_****MIkg

Probe                          HTTP  resultClass    detailClass    WB requestId
-----------------------------  ----  -------------  -------------  ----------------------------------
valid_tok  /ping                200  accepted       ok             (no requestId on 200)
valid_tok  /api/v1/seller-info  429  rate_limited   rate_limited   211e6abded8963a5d74bb6a0218f64fa
                                                                   0e381a21f4f970a720ff0705e1a3af04 (second run)

verdict.overall = BLOCKED  (reason = rate_limited)
```

These two runs are not failures — they are live evidence that the classifier correctly identifies WB's per-token rate limit (1 request / 24h for `Base` category tokens per `WB_API_PROOF_PLAN.md` §1) and surfaces it as `BLOCKED` rather than `FAIL`. `/ping` itself continued to return 200 in both runs.

## 6. Persistence evidence (Postgres)

After all five runs:

```text
$ psql -c "SELECT id, mode, token_masked, overall_result_class, verdict_overall, created_at FROM wb_token_validations ORDER BY created_at;"
                  id                  | mode | token_masked | overall_result_class | verdict_overall |          created_at
--------------------------------------+------+--------------+----------------------+-----------------+-------------------------------
 89f1b5f0-e4ac-4d4b-a6fa-1af11b0690d4 | A    | wb_****MIkg  | accepted             | PASS            | 2026-05-24 06:06:17.363204+00
 87985036-07e1-4de7-a424-deb18fd9898d | C    | wb_(unset)   | rejected             | PASS            | 2026-05-24 06:06:43.710212+00
 c24d5765-8fd6-4cc5-b281-ff571e579aba | A    | wb_****MIkg  | rate_limited         | BLOCKED         | 2026-05-24 06:07:01.817582+00
 85ad8add-f721-4a0c-8a24-a9a053032ee7 | A    | wb_****beef  | rejected             | FAIL            | 2026-05-24 06:07:05.786026+00
 ba41d7e8-0ddc-4ff6-ba62-98dd13d601d0 | A    | wb_****MIkg  | rate_limited         | BLOCKED         | 2026-05-24 06:08:36.304499+00
```

18 probe rows across the five runs are listed in `wb_token_validation_probes` with `(kind, subkind, http_status, result_class, detail_class, sid_present, request_id)`. The `token_masked` column is the only token-derived value persisted; no raw token, raw Authorization header, or other secret-bearing string is anywhere in the schema.

## 7. Stop conditions / non-events

- No 500-class WB outage observed.
- No transport / DNS / TLS errors.
- No `wrong_scope` (`token category`) responses observed — the `WB_API_TOKEN` provided has at least one scope that grants `/ping` and `/api/v1/seller-info`.
- No mutating WB endpoint was reached. Only `GET /ping` and `GET /api/v1/seller-info` were called.

## 8. Blockers

| ID | Blocker | Severity | Owner action needed |
|----|---------|----------|---------------------|
| (none) | The Mode A valid path produced a clean PASS on the first run (`89f1b5f0`). Subsequent re-validations within the same hour are expected to BLOCK on WB's per-token rate limit (1 request/24h for `Base` category). This is documented in `WB_API_PROOF_PLAN.md` §1 and is not a defect. | informational | Operators should run `npm run wb:validate` at most once per validation event per token, or budget for the 24h rate-limit window. |

## 9. Acceptance criteria for Pass 3 — final state

| Criterion (from `docs/devin/ACCEPTANCE_CHECKLIST.md` §Pass 3 acceptance) | State | Evidence |
|---|---|---|
| WB token validation is implemented or verified | met | §2 + §3 |
| WB sandbox availability is documented | met | `docs/devin/WB_SANDBOX_NOTES.md` (Pass 2-prep) |
| WB API proof plan is followed | met | §3 + `docs/devin/WB_API_PROOF_PLAN.md` |
| First WB surface used is `common-api.wildberries.ru` (`/ping` and `/api/v1/seller-info`) | met | §5 (every run) |
| Probe mode (A / B / C) recorded in the report | met | §5 + persisted in `wb_token_validations.mode` |
| Valid token accepted — HTTP 200 on `/ping` AND on `/api/v1/seller-info` with non-empty `sid` | met | Run `89f1b5f0` §5.1 |
| Invalid token rejected — HTTP 401 with `detail` matching `malformed_token` class | met | Runs `89f1b5f0`/`87985036`/`c24d5765`/`85ad8add`/`ba41d7e8` (bad_token probe) and Run `85ad8add` (valid_token slot with deliberately fake token) |
| No-token case rejected — HTTP 401 with `detail == "empty Authorization header"` | met | All five runs (no_token probe) |
| Error class documented (mapped per `WB_API_PROOF_PLAN.md` §5) | met | §3.2 |
| WB `requestId`s are recorded; raw tokens are NOT | met | `wb_token_validation_probes.request_id`; no token column exists in the schema |
| No production mutations were issued; only GET on `/ping` and `/api/v1/seller-info` | met | `src/wb/client.js` only exports a GET helper; no POST/PUT/DELETE/PATCH paths exist |
| No Ozon scope was added | met | grep `-Ri ozon src/` returns nothing |
| No broad marketplace abstraction was added | met | `src/wb/` is a single-vendor module; no `src/marketplaces/` or generic abstraction was introduced |
| Secrets were not exposed | met | §3.1; only masked labels surfaced anywhere |

## 10. Secret-loading method

```text
WB_API_TOKEN     — read from process.env (provided to the session via Devin Secrets); never echoed, never persisted in raw form.
DATABASE_URL     — read from process.env; the local Postgres password is a Pass 1 dev-only value (docker-compose.yml).
```

## 11. Confirmation

`Secrets were not exposed.`
