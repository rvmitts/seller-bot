# SellerNerve Acceptance Checklist for Devin Work

A task is accepted only if there is evidence.

## Pass 1 acceptance

- [x] Devin summarized repo structure.
- [x] Devin identified stack and package manager.
- [x] Devin listed existing API/bot/db/WB modules.
- [x] Devin documented env names without secret values.
- [x] API starts locally or blocker is specific.
- [x] Postgres readiness is proven or blocker is specific.
- [x] Health endpoint is proven or implemented minimally.
- [x] Commands are included.
- [x] Changed files are listed.
- [x] Secrets were not exposed.

## Pass 2 acceptance

- [x] Telegram bot token is loaded through env only.
- [x] Public URL is loaded through `APP_BASE_URL` or equivalent.
- [x] Webhook path is documented.
- [x] Test alert is sent.
- [x] Button `Проверяю` works.
- [x] Button `Статус` works.
- [x] Button `Пауза` works.
- [x] Button `Исправил` works.
- [x] Callback result is visible in DB/status/audit or safe logs.
- [x] Secrets were not exposed.

## Pass 3 acceptance

- [x] WB token validation is implemented or verified.
- [x] WB sandbox availability is documented (see `docs/devin/WB_SANDBOX_NOTES.md`).
- [x] WB API proof plan is followed (see `docs/devin/WB_API_PROOF_PLAN.md`).
- [x] First WB surface used is `common-api.wildberries.ru` (`/ping` and `/api/v1/seller-info`).
- [x] Probe mode (A production / B sandbox / C no-secret) is recorded in the report.
- [x] Valid token is accepted (HTTP 200 on `/ping` and, in Mode A, on `/api/v1/seller-info` with non-empty `sid`).
- [x] Invalid token is rejected (HTTP 401 with `detail` matching `malformed_token` class).
- [x] No-token case is rejected (HTTP 401 with `detail == "empty Authorization header"`).
- [x] Error class is documented (mapped per `WB_API_PROOF_PLAN.md` §5).
- [x] WB `requestId`s are recorded; raw tokens are NOT.
- [x] No production mutations were issued; only GET on `/ping` and `/api/v1/seller-info`.
- [x] No Ozon scope was added.
- [x] No broad marketplace abstraction was added.
- [x] Secrets were not exposed.

## Pass 4 acceptance

- [x] Only necessary fixes were made.
- [x] Health checks rerun.
- [x] Telegram checks rerun.
- [x] WB checks rerun.
- [x] Final report uses validation template.
- [x] PR/commit is linked if available.
- [x] Remaining blockers are explicit.
- [x] Secrets were not exposed.
