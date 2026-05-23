# Devin Prompt — SellerNerve WB-first Telegram-first Live Proof

You are Devin.ai acting as the primary execution engineer for SellerNerve.

## Mission

Build and validate the smallest reliable SellerNerve live proof:

1. local API health;
2. local Postgres readiness;
3. Telegram bot send;
4. Telegram callback button round-trip;
5. Wildberries token validation with valid and invalid token cases;
6. final evidence report with commands, changed files, PASS/FAIL results, PR/commit links, and remaining blockers.

## Strategic constraints

- Wildberries-first only.
- Telegram-first interface.
- Closed loop: detect/problem -> explain -> status/action -> verify -> report.
- No Ozon.
- No dashboard-first work.
- No billing.
- No broad marketplace abstraction before WB proof is green.
- No secrets in commits, comments, logs, screenshots, PR descriptions, or reports.
- Do not depend on Paperclip. Devin is the execution environment.

## Required reading before coding

Read these files first if present:

- SellerNerve migration handoff in `docs/migration/` or repo root.
- `README.md`.
- package manager lockfile and workspace config.
- existing env examples.
- API/bot/db source folders.
- existing tests and scripts.
- `docs/devin/PASS_PLAN.md`.
- `docs/devin/SECURITY_AND_SECRETS.md`.
- `docs/devin/VALIDATION_REPORT_TEMPLATE.md`.

If the handoff file is not in the repo, report it as a blocker and continue with the constraints in this prompt.

## Pass budget

Hard cap: **4 passes** for this milestone.

Pass 1 is combined and includes both repo/context audit and local API/Postgres health proof.

Do not spend a pass on vague exploration. Every pass must end with evidence.

## Pass 1 — Repo/context audit + local API/Postgres health proof

Goal:
Confirm repo state, understand stack, run local API and DB readiness checks.

Scope:

- Identify app stack, package manager, repo structure, run commands, test commands.
- Identify whether API, DB, Telegram, and WB modules already exist.
- Identify env variable names needed for local proof.
- Start local Postgres via Docker or use documented local DB path.
- Configure `DATABASE_URL` through environment only.
- Start local API.
- Verify `/health/live` and `/health/ready` or nearest existing health endpoints.
- If health endpoints are missing, implement the smallest possible endpoints.
- If DB readiness is missing, implement the smallest possible readiness check.
- Add or update docs only as needed.

Acceptance evidence:

- repo structure summary;
- stack/package manager summary;
- exact commands run;
- local API start result;
- DB readiness result;
- live/ready health result;
- changed files list;
- tests/smoke checks run;
- blockers, if any;
- statement: `Secrets were not exposed.`

## Pass 2 — Telegram send and callback proof

Goal:
Prove that the Telegram bot can send a test alert with inline buttons and process callback queries end-to-end.

Scope:

- Use env-only configuration for `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `APP_BASE_URL`, and test chat id if needed.
- Configure webhook path, preferably `/internal/telegram/webhook` if compatible with the repo.
- Use a public HTTPS tunnel only via env/config. Do not hardcode the URL.
- Send a test alert with buttons:
  - Проверяю
  - Статус
  - Пауза
  - Исправил
- Process callback query for each button.
- Persist or log observable status/audit changes without leaking sensitive data.
- Ensure repeated button presses are idempotent or handled safely.

Acceptance evidence:

- Telegram send PASS/FAIL;
- callback `Проверяю` PASS/FAIL;
- callback `Статус` PASS/FAIL;
- callback `Пауза` PASS/FAIL;
- callback `Исправил` PASS/FAIL;
- DB/status/audit evidence or safe log evidence;
- webhook path and configuration method;
- commands/scripts used;
- changed files list;
- statement: `Secrets were not exposed.`

## Pass 3 — Wildberries token validation proof

Goal:
Prove the WB-first credential validation path with valid and invalid token cases.

Scope:

- Implement or verify the narrow WB token probe.
- Use valid token only through secure environment/runtime secret channel.
- Test valid token acceptance.
- Test invalid token rejection.
- Classify errors in a useful way.
- Store/audit validation result if DB model exists; otherwise provide safe validation output.
- Do not introduce Ozon or a broad marketplace abstraction.

Acceptance evidence:

- valid WB token probe PASS/FAIL;
- invalid WB token probe PASS/FAIL;
- API endpoint or script used;
- error classes observed;
- confirmation that full token values never appeared in logs;
- changed files list;
- statement: `Secrets were not exposed.`

## Pass 4 — Fix-only final validation and report

Goal:
Fix only what is necessary to make the proof coherent, rerun smoke checks, and produce the final evidence report.

Scope:

- No new product scope.
- No dashboard.
- No Ozon.
- No refactor unless required to make prior proof pass.
- Rerun health, DB, Telegram, and WB checks.
- Produce final report using `docs/devin/VALIDATION_REPORT_TEMPLATE.md`.

Acceptance evidence:

- final PASS/FAIL table;
- commands run;
- changed files;
- PR/commit link if available;
- remaining blockers;
- exact owner action needed, if any;
- statement: `Secrets were not exposed.`

## Reporting format after every pass

At the end of every pass, post this structure:

```text
SellerNerve Devin Pass Report

Pass: <1/2/3/4>
Scope completed:
- ...

Commands run:
- ...

Results:
- API health: PASS/FAIL/N/A
- DB readiness: PASS/FAIL/N/A
- Telegram send: PASS/FAIL/N/A
- Telegram callbacks: PASS/FAIL/N/A
- WB valid token: PASS/FAIL/N/A
- WB invalid token: PASS/FAIL/N/A

Changed files:
- ...

Evidence:
- ...

Blockers:
- ...

Next pass recommendation:
- ...

Secrets were not exposed.
```

## Stop conditions

Stop and report immediately if:

- repo is missing or empty;
- the app cannot be started and the cause is outside repo control;
- required credentials are missing for Telegram or WB live proof;
- a secret appears to have been exposed;
- the task requires owner action.

Do not mark a task complete without evidence.
