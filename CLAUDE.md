# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Trilhão Beneficente** is an event registration system for a charity motorcycle offroad trail event in Presidente Olegário, MG, Brazil. 100% of proceeds go to ASSOAPAC (cancer patient support association). Participants register, pay via PIX through Mercado Pago, and confirmation is automated via webhook.

## Commands

```bash
npm run dev        # Start full-stack dev server (Express + Vite middleware at localhost:3000)
npm run build      # Build frontend to dist/
npm run start      # Production server (NODE_ENV=production tsx server.ts)
npm run clean      # Remove dist/
npm run lint       # TypeScript type check (tsc --noEmit) — no test suite exists
npm run deploy:rules  # Deploy Firestore security rules via Firebase CLI
```

## Architecture

### Two Backend Targets

The project has **two parallel backends** that must stay in sync:

1. **`server.ts`** — Express server for local dev and Railway deployment. Runs Vite in middleware mode during development. Serves `dist/` in production.
2. **`api/`** — Serverless functions structured for Vercel (file-based routing, no `vercel.json` present — Vercel is not the active deployment target). `api/payments/create.ts`, `api/webhook/mercadopago.ts`, `api/payments/verify/[id].ts`. Shared utilities live in `api/_lib/`: `firebase-admin.ts` (lazy `getAdminDb()`), `mercadopago.ts` (Orders API helpers + `getMercadoPagoNotificationUrl`), `http.ts` (`readBody`, `sendJson`, `handleOptions` for CORS).

When adding or changing API behavior, update both `server.ts` and the corresponding `api/` file.

### Frontend

All React components live in a single file: `src/App.tsx`. There is no component directory split. Routes:
- `/` — `LandingPage`: registration form with CEP auto-fill (ViaCEP), minor-of-age guardian section, and PIX payment initiation.
- `/payment/:id` — `PaymentPage`: shows PIX QR code and copy-paste code; uses Firestore `onSnapshot` to update live when payment is approved.
- `/admin` — `AdminDashboard`: Google Auth + admin check, then tabs for dashboard stats, registration management (with Excel export via `xlsx`), and settings.

Animations use `motion/react` (Motion library, successor to Framer Motion).

### Firebase

- **Client SDK** (`src/lib/firebase.ts`): initialized from `firebase-applet-config.json`. Exports `db`, `auth`, `googleProvider`, and `handleFirestoreError`.
- **Admin SDK** (`api/_lib/firebase-admin.ts` and inline in `server.ts`): initialized with `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON) or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.
- **Database ID**: uses `firebaseConfig.firestoreDatabaseId` from `firebase-applet-config.json` — currently `"(default)"`, the standard Firestore database.

### Shared API Helpers (`api/_lib/`)

| File | Exports |
|---|---|
| `firebase-admin.ts` | `getAdminDb()`, `getAdminAuth()` — lazy-initialized Admin SDK |
| `mercadopago.ts` | `getMercadoPagoAccessToken()`, `getMercadoPagoNotificationUrl()`, `getOrder()`, `findMpPaymentId(accessToken, reg)` — resolves numeric MP payment ID from orderId (ORD*), paymentId (trilhao-*), or numeric paymentId |
| `registrations.ts` | `approveRegistration(adminDb, paymentId, externalRef?)` — marks approved + decrements shirt inventory; `syncApproved(adminDb, paymentId, source, externalRef?)` — approve without touching inventory (manual verify) |
| `http.ts` | `readBody()`, `sendJson()`, `handleOptions()` — CORS and response helpers |

### Firestore Collections

| Collection | Purpose |
|---|---|
| `registrations` | Participant records. Fields: `status` (`pending`/`approved`/`cancelled`/`refunded`), `paymentId`, `orderId`, `pixCode` (base64), `copyPaste` (PIX code), `confirmedAt`, `cancelledAt`, `refundedAt`, `refundId`, `shirtSize`, `registrationNumber`, etc. |
| `payment_logs` | Webhook audit log, last 50 shown in admin. |
| `admins` | Documents keyed by Firebase UID granting admin access. |

### Admin Access

Admin access is granted if `user.email === "bwk.bruno@gmail.com"` OR if a document exists at `admins/{user.uid}` in Firestore. The settings tab inside admin is protected by a secondary password check in the client.

### Payment Flow

1. Frontend POSTs to `/api/payments/create` with amount, payer info.
2. Server creates a PIX order via Mercado Pago **Orders API** (`POST /v1/orders`) with `processing_mode: "automatic"` and `external_reference: "trilhao-{timestamp}"`.
3. Server returns `{ id: order.external_reference, orderId: order.id, point_of_interaction: { transaction_data: { qr_code, qr_code_base64, ticket_url } } }`.
4. Frontend saves registration to Firestore with `paymentId: "trilhao-{timestamp}"`, `orderId: "ORD01..."`, `status: "pending"`, and navigates to `/payment/{firestoreDocId}`.
5. Mercado Pago sends a webhook with `type: "order"` (Orders API) or `type: "payment"` (legacy Payments API). The handler fetches full payment/order info, extracts `external_reference`, and searches Firestore by it to approve the registration.
6. `/api/payments/verify/:id` can manually sync (admin dashboard). Handles `trilhao-*` IDs via payments search API.
7. Admin can cancel/refund via `POST /api/payments/cancel/:id` (Firebase Auth required). Pending → `cancelled`; Approved → calls MP refund API, then → `refunded` and restores shirt inventory.

### Mercado Pago SDK Initialization

The webhook URL is derived from `APP_URL` env var and is only set if the URL uses HTTPS and is not localhost. The Mercado Pago JS SDK is loaded via CDN in `index.html` and initialized client-side for device session tracking.

## Environment Variables

Copy `.env.example` to `.env`. Required for payments:

```
MERCADO_PAGO_ACCESS_TOKEN=     # Server-side: APP_USR-... (production and test — never TEST- prefix)
VITE_MERCADO_PAGO_PUBLIC_KEY=  # Client-side public key
APP_URL=                        # Full HTTPS URL for webhook (e.g. https://yourdomain.com)
VITE_MERCADO_PAGO_TEST_BUYER=  # "true" to prefill test buyer data in localhost
WEBHOOK_SECRET=                 # (optional) HMAC-SHA256 secret for MP webhook signature verification
EVENT_PRICE=                    # Inscription price in BRL (default: 1)
ADMIN_EMAIL=                    # Admin email override (default: bwk.bruno@gmail.com)
ALLOWED_ORIGINS=                # (optional) Extra CORS origins beyond APP_URL, comma-separated
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
- **BOM divergence**: `server.ts` strips the UTF-8 BOM from `FIREBASE_SERVICE_ACCOUNT_KEY` (`replace(/^﻿/, "")`) before `JSON.parse`; `api/_lib/firebase-admin.ts` does not. Keep this in sync if modifying either.
- **`@google/genai`** is an unused dependency (leftover from project template). `GEMINI_API_KEY` in `.env.example` is similarly unused — do not add Gemini features unless explicitly requested.
- **Rate limiting**: `paymentCreateLimiter` (5 req/min) on `/api/payments/create`; `paymentVerifyLimiter` (20 req/min) on `/api/payments/verify/:id` and `/api/payments/cancel/:id`.
- **Webhook signature**: `verifyMpWebhookSignature()` in `server.ts` verifies HMAC-SHA256 using `WEBHOOK_SECRET`. If `WEBHOOK_SECRET` is unset, verification is skipped (dev mode). Configure the secret in the MP dashboard under Integrações > Webhooks.
- **CORS**: configured with `ALLOWED_ORIGINS` env var + `APP_URL`. In production, set both to avoid CORS errors.
- **Firestore `settings/registration_counter`**: write is restricted — only `{ lastNumber: int > 0 }` is allowed. The client uses `tx.set(counterRef, { lastNumber: nextNumber })` inside a transaction.

## Mercado Pago Integration Guidelines

MCP Server configured at `https://mcp.mercadopago.com/mcp` (transport: HTTP). Always use it when working on payment features:

- Before answering about payments, consult the MCP with `search_documentation`.
- After implementing payment features, validate with `quality_checklist`.
- **siteId: MLB** (Brazil) in all API calls.
- The codebase uses the **Orders API** (`POST /v1/orders`, `GET /v1/orders/{id}`) via native `fetch` — the SDK does not support it.
- For test credentials, use `APP_USR-` prefix, not `TEST-`. Never hardcode tokens; always read from env vars.
- Access token is server-side only (`MERCADO_PAGO_ACCESS_TOKEN`). Public key is client-side only (`VITE_MERCADO_PAGO_PUBLIC_KEY`).

## Webhook / Payment ID Strategy

The Mercado Pago Orders API (`/v1/orders`) creates orders with IDs like `ORD01...`. Webhook notifications arrive as either `type: "order"` (with the ORD ID) or `type: "payment"` (with a numeric payment ID like `159351815316`). The only reliable shared identifier across both notification types is `external_reference` (set to `"trilhao-{timestamp}"` at order creation).

**Resolution**: The server's `payments/create` endpoint returns `id: order.external_reference` (not `order.id`). The frontend saves `paymentId: "trilhao-XXXX"` in Firestore. The webhook handler searches by `paymentId == paymentInfo.external_reference` when the direct numeric lookup finds nothing.

- `paymentId` in Firestore for new registrations = `"trilhao-{timestamp}"` (the `external_reference`)
- `orderId` in Firestore = `"ORD01..."` (the Orders API order ID)
- Verify endpoint handles three ID formats: `ORD*` → Orders API, `trilhao-*` → payments search by external_reference, numeric → legacy Payments API

## Production Deployment (Railway)

- **URL**: `https://trilhao-web-production.up.railway.app`
- **Project**: `trilhao-beneficente` (ID `00b510f4-e7f5-4734-b6fa-94b992daeb06`)
- **Service**: `trilhao-web` (ID `7a7d956b-918d-4b76-b95d-5412b3e28a9a`)
- Deploy: `railway up --detach` (uploads local files) or push to GitHub if GitHub integration is set up
- Node >=20 per `package.json` engines; Railway is configured to run Node 24.
- **MP Webhook** subscribed to `payment` topic at `https://trilhao-web-production.up.railway.app/api/webhook/mercadopago`. The webhook handler also processes `type: "order"` notifications (Orders API); verify the subscription includes both topics if order-type notifications are not arriving.

## Firestore Rules Deployment

Firebase CLI login does not persist across terminals easily. Deploy rules programmatically using `api/_lib/firebase-admin.ts` service account credentials and the Firebase Rules REST API (`firebaserules.googleapis.com`). See the PowerShell script approach used previously: create a ruleset via `POST /v1/projects/{id}/rulesets`, then update the release via `PATCH /v1/projects/{id}/releases/cloud.firestore`.
