# OCSFbillinghelper

Password-protected web app for Florida orthopedic surgery billing under the LOP
statute (cap of 120% of Medicare). Staff paste a case blurb; the app emits two
markdown tables (Surgeon, Surgery Center & Anesthesia) plus FCSO verification
flags. All math is deterministic and runs from two static CSVs in `/data` —
no LLM, no database.

## Local development

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and set OCSF_PASSWORD + OCSF_COOKIE_SECRET
#   OCSF_COOKIE_SECRET: generate with `openssl rand -hex 32`
npm run dev
# open http://localhost:3000 → enter password → start a case
```

**Node version:** use **Node 20 LTS or Node 22 LTS**. Next.js 14.2 has known
startup hangs on Node 24 (the dev server can sit silently without ever
listening on its port). If you're on Node 24+, install nvm and run
`nvm install 22 && nvm use 22` before `npm install`.

Run tests:

```bash
npm test
```

## Updating the CSVs

Drop new versions of the two files into `data/`:
- `data/master_physician_ocsf.csv`
- `data/master_asc.csv`

Required columns are unchanged from the original schema. Restart `npm run dev`
(or redeploy) — the loader caches the parsed rows once per process, so a new
deploy is the cleanest way to refresh.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Set environment variables in Project Settings → Environment Variables:
   - `OCSF_PASSWORD` — the shared office password.
   - `OCSF_COOKIE_SECRET` — long random string (`openssl rand -hex 32`).
4. Deploy.

To rotate the password, update `OCSF_PASSWORD` in Vercel and redeploy. To
force everyone to log back in, also rotate `OCSF_COOKIE_SECRET`.

## Session logging — local vs. deployed

Session output is **byte-identical** between modes; only the delivery
mechanism differs.

- **Local dev:** one file per session is written to
  `sessions/OCSF_session_<YYYY-MM-DD>_<HHMMSS>.md`.
- **Vercel:** the same markdown is returned in the `/api/session` response and
  the browser triggers a download with the same filename. (Vercel functions
  have a read-only filesystem, so writing to `sessions/` is not possible.)

The runtime auto-detects via `process.env.VERCEL === '1'` plus a probe-write
fallback for sandboxed local environments.

## Project layout

```
app/                Next.js App Router (UI + API routes)
components/         Chat UI primitives (MessageBubble, BillingTable, …)
lib/                csvLoader, blurbParser, billingEngine, billingFormat,
                    fcsoFlags, sessionLogger, cookies (auth)
data/               CSV fee schedules (single source of truth)
types/              Shared TypeScript types
sessions/           Local session output (gitignored)
__tests__/          vitest unit tests for the billing engine
middleware.ts       Edge auth gate
```

See `CLAUDE.md` for the full BILLING LOGIC SPEC and developer rules.
