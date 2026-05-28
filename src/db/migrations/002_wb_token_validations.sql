-- Pass 3 schema: persist Wildberries token validation runs and per-probe results.
-- All tables use IF NOT EXISTS so the migration is safe to re-run.

CREATE TABLE IF NOT EXISTS wb_token_validations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host                  text NOT NULL,
  mode                  text NOT NULL,                     -- A | B | C
  token_masked          text NOT NULL,                     -- e.g. 'wb_****abcd' or 'wb_(unset)'
  overall_result_class  text NOT NULL,                     -- accepted | rejected | unavailable | rate_limited | unknown_error
  verdict_overall       text,                              -- PASS | FAIL | BLOCKED | N/A | UNKNOWN
  verdict               jsonb NOT NULL DEFAULT '{}'::jsonb,
  config                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wb_token_validations_created_at
  ON wb_token_validations(created_at DESC);

CREATE TABLE IF NOT EXISTS wb_token_validation_probes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES wb_token_validations(id) ON DELETE CASCADE,
  kind            text NOT NULL,                           -- no_token | bad_token | valid_token
  subkind         text,                                    -- ping | seller_info | null
  pathname        text NOT NULL,                           -- e.g. '/ping' (never includes the token)
  http_status     int  NOT NULL DEFAULT 0,                 -- 0 == transport/network error
  result_class    text,                                    -- accepted | rejected | unavailable | rate_limited | unknown_error | n/a
  detail_class    text,                                    -- ok | missing_token | malformed_token | ...
  detail          text,                                    -- WB's `detail` string (safe; contains no secret)
  title           text,
  request_id      text,                                    -- WB `requestId` for support
  sid_present     boolean NOT NULL DEFAULT false,
  name_present    boolean NOT NULL DEFAULT false,
  ping_status     text,                                    -- e.g. 'OK' from /ping body
  network_error   text,                                    -- e.g. 'timeout' when no HTTP exchange happened
  duration_ms     int NOT NULL DEFAULT 0,
  skipped         boolean NOT NULL DEFAULT false,
  skip_reason     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wb_token_validation_probes_run
  ON wb_token_validation_probes(run_id);
