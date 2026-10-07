# Gold Predictor frontend

Next.js 16 pages exported as static files (`out/`) and served by their own Cloudflare Worker (`gold-predictor`). There is
no server code here: every page runs in the browser and calls the backend API in [../api](../api) (its own Worker,
`gold-predictor-api`). The API address is baked in at build time from `NEXT_PUBLIC_API_URL`.

```bash
npm install
npm run dev        # http://localhost:3000, needs .env.local (copy .env.example) and the API running (../api: npm run dev)
npm run build      # static export to out/, then scripts/postbuild.mjs writes security headers (_headers)
npm run deploy     # wrangler deploy (static assets only)
```

Deployment steps are in [../docs/DEPLOY.md](../docs/DEPLOY.md).
