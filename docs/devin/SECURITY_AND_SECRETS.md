# Security and Secrets Rules

## Absolute rules

Never expose:

- full Wildberries API token;
- Telegram bot token;
- Telegram webhook secret;
- database password;
- production URL credentials;
- private seller/account data unless explicitly safe and masked.

## Allowed in reports

Allowed:

- env variable names;
- PASS/FAIL results;
- masked token references such as `wb_****abcd` only if necessary;
- error class;
- request id;
- incident id;
- safe command examples with placeholders.

Not allowed:

- real token values;
- real `.env` file content;
- screenshots showing secret values;
- logs with raw Authorization headers;
- PR descriptions containing secret values.

## Required statement

Every pass report must include:

```text
Secrets were not exposed.
```

## If a secret leaks

1. Stop work.
2. Report exactly where the leak occurred without repeating the secret.
3. Mark the leaked secret as compromised.
4. Ask owner to rotate it.
5. Remove the secret from visible surfaces where possible.
6. Check git history if committed.

## Env-only policy

Use runtime environment variables, platform secrets, or local `.env` ignored by git.

Do not commit `.env`.

Commit only examples such as `.env.example.sellernerve` with placeholder values.
