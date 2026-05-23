# SellerNerve Acceptance Checklist for Devin Work

A task is accepted only if there is evidence.

## Pass 1 acceptance

- [ ] Devin summarized repo structure.
- [ ] Devin identified stack and package manager.
- [ ] Devin listed existing API/bot/db/WB modules.
- [ ] Devin documented env names without secret values.
- [ ] API starts locally or blocker is specific.
- [ ] Postgres readiness is proven or blocker is specific.
- [ ] Health endpoint is proven or implemented minimally.
- [ ] Commands are included.
- [ ] Changed files are listed.
- [ ] Secrets were not exposed.

## Pass 2 acceptance

- [ ] Telegram bot token is loaded through env only.
- [ ] Public URL is loaded through `APP_BASE_URL` or equivalent.
- [ ] Webhook path is documented.
- [ ] Test alert is sent.
- [ ] Button `Проверяю` works.
- [ ] Button `Статус` works.
- [ ] Button `Пауза` works.
- [ ] Button `Исправил` works.
- [ ] Callback result is visible in DB/status/audit or safe logs.
- [ ] Secrets were not exposed.

## Pass 3 acceptance

- [ ] WB token validation is implemented or verified.
- [ ] Valid token is accepted.
- [ ] Invalid token is rejected.
- [ ] Error class is documented.
- [ ] No Ozon scope was added.
- [ ] No broad marketplace abstraction was added.
- [ ] Secrets were not exposed.

## Pass 4 acceptance

- [ ] Only necessary fixes were made.
- [ ] Health checks rerun.
- [ ] Telegram checks rerun.
- [ ] WB checks rerun.
- [ ] Final report uses validation template.
- [ ] PR/commit is linked if available.
- [ ] Remaining blockers are explicit.
- [ ] Secrets were not exposed.
