# Gold Predictor web app

Next.js 16 app deployed to Cloudflare Workers with `@opennextjs/cloudflare`. It only reads from Neon Postgres; the
Python jobs in the repo root write the data. Login is handled by Cloudflare Access, and every API call re-checks the
signed Access token (`lib/access.ts`).

```bash
npm install
npm test                      # query tests on a local Postgres engine + token-check tests
npm run dev                   # needs .env.local with DATABASE_URL and DEV_USER_EMAIL (same keys as .dev.vars.example)
npm run cf:build              # production bundle for Workers (.open-next/)
```

Deployment steps are in [../docs/DEPLOY.md](../docs/DEPLOY.md).
