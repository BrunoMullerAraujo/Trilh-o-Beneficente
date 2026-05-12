# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Trilhão Beneficente** is an event registration system for a charity motorcycle offroad trail event in Presidente Olegário, MG, Brazil. 100% of proceeds go to ASSOAPAC (cancer patient support association). Participants register, pay via PIX through Mercado Pago, and confirmation is automated via webhook.

## Commands

```bash
npm run dev        # Start full-stack dev server (Express + Vite middleware at localhost:3000)
npm run build      # Build frontend to dist/
npm run start      # Production server (NODE_ENV=production tsx server.ts)
npm run lint       # TypeScript type check (tsc --noEmit) — no test suite exists
npm run deploy:rules  # Deploy Firestore security rules via Firebase CLI
```

## Architecture

### Two Backend Targets

The project has **two parallel backends** that must stay in sync:

1. **`server.ts`** — Express server for local dev and Railway/VPS deployment. Runs Vite in middleware mode during development. Serves `dist/` in production.
2. **`api/`** — Vercel serverless functions (file-based routing). `api/payments/create.ts`, `api/webhook/mercadopago.ts`, `api/payments/verify/[id].ts`. Shared utilities live in `api/_lib/`.

When adding or changing API behavior, update both `server.ts` and the corresponding `api/` file.

### Frontend

All React components live in a single file: `src/App.tsx`. There is no component directory split. Routes:
- `/` — `LandingPage`: registration form with CEP auto-fill (ViaCEP), minor-of-age guardian section, and PIX payment initiation.
- `/payment/:id` — `PaymentPage`: shows PIX QR code and copy-paste code; uses Firestore `onSnapshot` to update live when payment is approved.
- `/admin` — `AdminDashboard`: Google Auth + admin check, then tabs for dashboard stats, registration management, and settings.

### Firebase

- **Client SDK** (`src/lib/firebase.ts`): initialized from `firebase-applet-config.json`. Exports `db`, `auth`, `googleProvider`, and `handleFirestoreError`.
- **Admin SDK** (`api/_lib/firebase-admin.ts` and inline in `server.ts`): initialized with `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON) or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.
- **Database ID**: uses a named Firestore database from `firebaseConfig.firestoreDatabaseId` (not `(default)`).

### Firestore Collections

| Collection | Purpose |
|---|---|
| `registrations` | Participant records. Fields: `status` (`pending`/`approved`), `paymentId`, `pixCode` (base64), `copyPaste` (PIX code), `confirmedAt`, etc. |
| `payment_logs` | Webhook audit log, last 50 shown in admin. |
| `admins` | Documents keyed by Firebase UID granting admin access. |

### Admin Access

Admin access is granted if `user.email === "bwk.bruno@gmail.com"` OR if a document exists at `admins/{user.uid}` in Firestore. The settings tab inside admin is protected by a secondary password check in the client.

### Payment Flow

1. Frontend POSTs to `/api/payments/create` with amount, payer info, and optional `device_session_id`.
2. Server creates a PIX payment via Mercado Pago SDK and returns the result.
3. Frontend saves registration to Firestore `registrations` with `status: "pending"` and navigates to `/payment/:id`.
4. Mercado Pago sends a webhook to `/api/webhook/mercadopago`; the server fetches full payment info, logs it to `payment_logs`, and updates `registrations` status to `approved`.
5. `/api/payments/verify/:id` can manually sync a payment (used from the admin dashboard).

### Mercado Pago SDK Initialization

The webhook URL is derived from `APP_URL` env var and is only set if the URL uses HTTPS and is not localhost. The Mercado Pago JS SDK is loaded via CDN in `index.html` and initialized client-side for device session tracking.

## Environment Variables

Copy `.env.example` to `.env`. Required for payments:

```
MERCADO_PAGO_ACCESS_TOKEN=     # Server-side: APP_USR-... (production and test — never TEST- prefix)
VITE_MERCADO_PAGO_PUBLIC_KEY=  # Client-side public key
APP_URL=                        # Full HTTPS URL for webhook (e.g. https://yourdomain.com)
VITE_MERCADO_PAGO_TEST_BUYER=  # "true" to prefill test buyer data in localhost
```

Firebase Admin (one of):
```
FIREBASE_SERVICE_ACCOUNT_KEY=  # Full service account JSON (preferred)
FIREBASE_CLIENT_EMAIL=          # Alternative
FIREBASE_PRIVATE_KEY=           # Alternative
```

## Key Constraints

- **`firebase-applet-config.json`** must exist at repo root — it contains Firebase client config and the named Firestore database ID. Not in `.gitignore`, intentionally committed.
- The Mercado Pago webhook only fires for HTTPS non-localhost `APP_URL`; in local dev the webhook path must be tested manually via `verify/:id`.
- `npm run lint` is the only automated check. Run it before committing to catch type errors.

## Mercado Pago Integration Guidelines

MCP Server configured at `https://mcp.mercadopago.com/mcp` (transport: HTTP). Always use it when working on payment features:

- Before answering about payments, consult the MCP with `search_documentation`.
- After implementing payment features, validate with `quality_checklist`.
- **siteId: MLB** (Brazil) in all API calls.
- Prefer the **Orders API** (nova) over the legacy Payments API — the current codebase still uses the legacy `payment.create()` and should be migrated.
- For test credentials, use `APP_USR-` prefix, not `TEST-`. Never hardcode tokens; always read from env vars.
- Access token is server-side only (`MERCADO_PAGO_ACCESS_TOKEN`). Public key is client-side only (`VITE_MERCADO_PAGO_PUBLIC_KEY`).
