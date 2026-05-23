# Task Packet for Devin — First Live-Proof Milestone

## Task title

Prove SellerNerve local API, Telegram callbacks, and WB token validation

## Goal

Deliver the smallest evidence-backed proof that SellerNerve can run locally, connect to Postgres, send Telegram alerts with callback buttons, and validate Wildberries credentials.

## Scope

### In scope

- repo/context audit;
- local API boot;
- local Postgres readiness;
- health endpoints;
- Telegram send;
- Telegram webhook callback processing;
- status/action handling for four buttons;
- WB valid/invalid token probe;
- final validation report.

### Out of scope

- Paperclip;
- Ozon;
- dashboard-first UI;
- billing;
- generalized marketplace framework;
- advanced analytics;
- large refactor;
- production deployment unless already trivial and documented.

## Required buttons

- `Проверяю`
- `Статус`
- `Пауза`
- `Исправил`

## Required env names

Use existing repo names if already defined. Otherwise prefer:

- `DATABASE_URL`
- `APP_BASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_TEST_CHAT_ID`
- `WB_API_TOKEN`
- `NODE_ENV`
- `LOG_LEVEL`

## Acceptance criteria

- API health is green or nearest equivalent is documented.
- DB readiness is green.
- Telegram sends a test message.
- Telegram receives and handles callback query from each required button.
- WB valid token probe succeeds.
- WB invalid token probe fails safely with a useful error class.
- Secrets are loaded through env/runtime only.
- No secrets appear in code, logs, reports, screenshots, PR descriptions, or commits.
- Final report includes commands, results, changed files, PR/commit link, and blockers.
