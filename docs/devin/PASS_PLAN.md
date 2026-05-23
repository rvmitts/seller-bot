# SellerNerve Devin Pass Plan

## Hard cap

Maximum: **4 passes** for the first live-proof milestone.

Pass 1 combines the old Pass 1 and Pass 2:

- old Pass 1: repo/context audit;
- old Pass 2: local API + DB health proof.

This means there is no separate exploration-only pass.

## Pass 1 — Repo/context audit + local API/Postgres health proof

Deliverables:

- repo structure summary;
- stack/package manager summary;
- existing modules found/missing;
- env names identified;
- local Postgres path;
- API start proof;
- `/health/live` proof;
- `/health/ready` proof;
- DB readiness proof;
- changed files;
- smoke/test results;
- blockers.

Pass 1 is accepted only if it includes actual command outputs or safe proof snippets.

## Pass 2 — Telegram send + callback proof

Deliverables:

- webhook path;
- public HTTPS config method;
- test alert sent;
- inline buttons included;
- `Проверяю` callback proof;
- `Статус` callback proof;
- `Пауза` callback proof;
- `Исправил` callback proof;
- DB/status/audit evidence or safe log evidence;
- idempotency note.

## Pass 3 — WB token validation proof

Deliverables:

- WB token validation method;
- valid token accepted;
- invalid token rejected;
- error classes documented;
- no broad marketplace abstraction;
- no Ozon code;
- no token leakage.

## Pass 4 — Fix-only final validation/report

Deliverables:

- fix only previous blockers;
- rerun health, DB, Telegram, and WB checks;
- final validation report;
- final PASS/FAIL table;
- PR/commit link if available;
- exact owner action list.

## Rules

- Every pass must end with evidence.
- No pass can end with only “progress made”.
- If a credential is missing, report the missing env name and continue only with mock/negative checks that do not require secrets.
- Do not reveal real secret values.
- Do not add Ozon, billing, dashboard, or broad marketplace abstraction.
