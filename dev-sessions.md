# Dev Sessions Log

Append-only log of developer work performed by Claude Code on this repo.

---

## 2026-04-30 — Initial scaffold

**Summary:** Built OCSFbillinghelper from scratch per the spec. Captured 10
locked-in design decisions before scaffolding (CPT regex, FCSO flag triggers,
locality 03 toggle, auth model, multi-procedure handling, modifier stacking,
session log layout, environment auto-detection, and skill scope). Implemented
edge-middleware auth, Node-runtime billing engine, client-only chat UI, and
session logger that auto-detects between local file-write and browser
download. Tests use the real CSVs and verify multipliers, OCSF charge rules,
ASC modifier-neutrality, missing-CPT FCSO flagging, and rounding.

**Files touched:**
- `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`,
  `postcss.config.js`, `vitest.config.ts`, `.gitignore`, `.env.local.example`,
  `next-env.d.ts`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`,
  `app/login/page.tsx`, `app/api/auth/route.ts`,
  `app/api/compute/route.ts`, `app/api/session/route.ts`
- `components/ChatThread.tsx`, `components/MessageBubble.tsx`,
  `components/BillingTable.tsx`, `components/FCSOWarning.tsx`,
  `components/CaseInputBox.tsx`
- `lib/csvLoader.ts`, `lib/blurbParser.ts`, `lib/billingEngine.ts`,
  `lib/billingFormat.ts`, `lib/fcsoFlags.ts`, `lib/sessionLogger.ts`,
  `lib/cookies.ts`
- `types/billing.ts`
- `middleware.ts`
- `data/master_physician_ocsf.csv`, `data/master_asc.csv` (copied from `~/Desktop`)
- `__tests__/billingEngine.test.ts`
- `README.md`, `CLAUDE.md`, `dev-sessions.md`
