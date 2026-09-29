# BUILDFlow

Mobile-first construction operating system for premium residential contractors.
See `PRODUCT.md`, `BUILDFLOW_CLAUDE_CODE_PROMPT.md` and the `docs/` folder.

## Run locally

```bash
pnpm install
cp .env.example .env            # then set DATABASE_URL and SESSION_SECRET (32+ chars)
pnpm exec prisma migrate dev
pnpm db:seed
pnpm dev
```

Checks: `pnpm typecheck && pnpm lint && pnpm test` · end-to-end: `pnpm build && pnpm start`, then `pnpm test:e2e`
(start the server with `LOGIN_RATE_LIMIT_IP=1000 LOGIN_RATE_LIMIT_EMAIL=1000` so the many test logins are not throttled).

Deploying: `docs/DEPLOY.md`.
