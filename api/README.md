# Gold Predictor API (backend)

A JSON API on its own Cloudflare Worker (`gold-predictor-api`). It reads and writes Neon Postgres (the Python jobs in the
repo root fill it), checks sign-in on every request, and serves the separate frontend in `../web` over CORS.

```bash
npm install
npm test            # query, auth and admin tests on a real in-memory Postgres (PGlite)
npm run dev         # http://localhost:8787, needs .dev.vars (copy .dev.vars.example)
npm run deploy      # wrangler deploy
```

- Routes: `src/routes.ts` (one table: method, path, handler, who may call it).
- Entry, CORS and origin check: `src/index.ts`. Sign-in and roles: `src/lib/http.ts`, `src/lib/access.ts`.
- SQL: `src/lib/queries.ts`, `src/lib/admin.ts`. `tests/schema.pg.sql` is generated from `core/store.py` (CI checks it).

Sessions are an HttpOnly cookie set by `/api/login`. The browser sends it to this API because the frontend and the API
are on the same site (both under `<account>.workers.dev`, or both under one custom domain); list the frontend's origin
in `ALLOWED_ORIGINS`.
