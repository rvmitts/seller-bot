# SellerNerve Devin Pack

This pack is meant to be committed into the SellerNerve repository and given to Devin.ai together with the main handoff document.

Primary execution agent: **Devin.ai**.
Paperclip is intentionally out of scope. Do not mention or depend on Paperclip in execution plans, task routing, workspace assumptions, or acceptance reports.

## Files

- `DEVIN_PROMPT.md` — main copy-paste prompt for Devin.
- `docs/devin/PASS_PLAN.md` — max 4-pass execution plan. Pass 1 combines repo/context audit and local API/Postgres health proof.
- `docs/devin/TASKS_FOR_DEVIN.md` — concrete task packet for the first live-proof milestone.
- `docs/devin/VALIDATION_REPORT_TEMPLATE.md` — final evidence report template.
- `docs/devin/ACCEPTANCE_CHECKLIST.md` — owner/CEO acceptance checklist.
- `docs/devin/SECURITY_AND_SECRETS.md` — secret-handling rules.
- `.env.example.sellernerve` — env names only, no real secrets.

## How to use

1. Put this pack in the repo root.
2. Put the SellerNerve migration handoff in `docs/migration/`.
3. Send Devin the content of `DEVIN_PROMPT.md`.
4. Tell Devin to follow `docs/devin/PASS_PLAN.md` and stop after each pass with evidence.
5. Do not provide real tokens in chat, comments, issues, PR descriptions, or logs.

## Goal

The first milestone is not a full product rebuild. The first milestone is a narrow live proof:

- local API health works;
- Postgres readiness works;
- Telegram bot can send a message;
- Telegram callback buttons work end-to-end;
- WB token validation accepts a valid token and rejects an invalid token;
- secrets are never exposed;
- every completed step has evidence.
