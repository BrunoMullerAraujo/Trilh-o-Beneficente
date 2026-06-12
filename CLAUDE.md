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
2. **`api/`** — Serverless functions structured for Vercel (file-based routing, no `vercel.json` present — Vercel is not the active deployment target). `api/payments/create.ts`, `api/webhook/mercadopago.ts`, `api/payments/verify/[id].ts`, `api/payments/cancel/[id].ts`, `api/payments/receipt/[id].ts`. Shared utilities live in `api/_lib/`.

When adding or changing API behavior, update both `server.ts` and the corresponding `api/` file.

### Frontend

All React components live in a single file: `src/App.tsx`. There is no component directory split. Routes:
- `/` — `LandingPage`: registration form with CEP auto-fill (ViaCEP), minor-of-age guardian section, lunch voucher add-ons, and PIX payment initiation.
- `/payment/:id` — `PaymentPage`: shows PIX QR code and copy-paste code; uses Firestore `onSnapshot` to update live when payment is approved.
- `/checkin/:id` — Check-in and terms-signing flow: scan QR on arrival, show registration data, capture digital signature for the responsibility term.
- `/validar-voucher/:docId/:code` — Admin-facing voucher validation page (mark lunch voucher as used).
- `/admin` — `AdminDashboard`: Google Auth + admin check, then tabs for dashboard stats, registration management (with Excel export via `xlsx`), WhatsApp/email notification queue, and settings.

Animations use `motion/react` (Motion library, successor to Framer Motion).

### Firebase

- **Client SDK** (`src/lib/firebase.ts`): initialized from `firebase-applet-config.json`. Exports `db`, `auth`, `googleProvider`, and `handleFirestoreError`.
- **Admin SDK** (`api/_lib/firebase-admin.ts` and inline in `server.ts`): initialized with `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON) or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.
- **Database ID**: uses `firebaseConfig.firestoreDatabaseId` from `firebase-applet-config.json` — currently `"(default)"`, the standard Firestore database.

### Shared API Helpers (`api/_lib/`)

| File | Exports |
|---|---|
| `firebase-admin.ts` | `getAdminDb()`, `getAdminAuth()` — lazy-initialized Admin SDK |
| `mercadopago.ts` | `getMercadoPagoAccessToken()`, `getMercadoPagoNotificationUrl()`, `createPixPayment()` (Payments API), `getOrder()` (Orders API, legacy lookup), `findMpPaymentId(accessToken, reg)` — resolves numeric MP payment ID from orderId or paymentId |
| `registrations.ts` | `approveRegistration(adminDb, paymentId, externalRef?)` — marks approved + decrements shirt inventory; `syncApproved(adminDb, paymentId, source, externalRef?)` — approve without touching inventory (manual verify); `healRegistrationNumber(adminDb, docId)` — assigns next counter number to a registration that is missing one, safe to call on any status |
| `http.ts` | `readBody()`, `sendJson()`, `handleOptions()` — CORS and response helpers |
| `email.ts` | `sendPendingEmail()`, `sendConfirmationEmail()` (attaches PDF), `sendSignedTermEmail()` (attaches term PDF) — sends via Brevo if `BREVO_API_KEY` is set, else Resend |
| `pdf.ts` | `generateConfirmationPdf(reg, docId, appUrl)` — A4 PDF with QR code and voucher pages; `generateTermPdf(reg, docId)` — responsibility term with digital signature image |
| `whatsapp.ts` | `initWhatsApp(db)`, `initEmailWorker(db)`, `getWhatsAppStatus()`, `disconnectWhatsApp()`, `reconnectFresh()`, `enqueueMessage()`, `enqueueWhatsAppMessage()`, `buildConfirmationMessage()`, `retryMessage()` — Baileys-based WA + Firestore queue worker |

### Firestore Collections

| Collection | Purpose |
|---|---|
| `registrations` | Participant records. Fields: `status` (`pending`/`approved`/`cancelled`/`refunded`), `paymentId`, `orderId`, `pixCode` (base64), `copyPaste` (PIX code), `confirmedAt`, `cancelledAt`, `refundedAt`, `refundId`, `shirtSize`, `registrationNumber`, `checkedIn`, `checkedInAt`, `termsSigned`, `termsSignedAt`, `termsSignature` (data URL), `vouchers[]` ({`name`, `code`, `used`, `usedAt`, `cancelled`, `cancelledAt`}), `cancelOperatorEmail`, `cancelOperatorName`, `refundOperatorEmail`, `refundOperatorName` (audit — set on cancel/refund), `nameEditedAt`, `nameEditedBy` (audit — set when admin edits name), etc. |
| `payment_logs` | Webhook audit log, last 50 shown in admin. |
| `admins` | Documents keyed by Firebase UID granting admin access. |
| `message_queue` | Unified notification queue for both `email` and `whatsapp` channels. Fields: `channel`, `status` (`pending`/`sending`/`sent`/`retry`/`failed`), `emailType` (`confirmation`/`pending`/`term`), `registrationId`, `attempts`, etc. Processed by workers in `api/_lib/whatsapp.ts`. |
| `settings/registration_counter` | Auto-increment counter for `registrationNumber`. Write restricted to `{ lastNumber: int > 0 }`. |
| `settings/shirt_inventory` | Per-size available shirt counts (`P`, `M`, `G`, `GG`, `XGG`, `EX`). Decremented on approval, incremented on refund. |
| `settings/shirt_inventory_total` | Admin-configured total per size. `reserved = total - available`. Read/write: admin only. |
| `settings/event_config` | Event-level config: `allowMultipleCpf: boolean`, `eventPrice: number`, `voucherPrice: number`, `nextEventPrice: number` (próximo valor após reajuste), `priceChangeDate: string` (ISO date — último dia do valor atual). Read publicly (formulário), write admin only. |
| `settings/whatsapp_session` | WA session files (base64) + warmup state, persisted so Railway restarts don't require a new QR scan. |
| `settings/whatsapp_ban` | WA ban state (403 cooldown). Prevents reconnection attempts for 7 days. |
| `settings/allowed_admins` | `emails: string[]` — extra admin emails managed via the settings tab UI. |

### Admin Access

Admin access is granted if any of three conditions hold:
1. `user.email === ADMIN_EMAIL` (env `ADMIN_EMAIL`, default `bwk.bruno@gmail.com`)
2. A document exists at `admins/{user.uid}` in Firestore
3. `user.email` appears in the `emails` array of `settings/allowed_admins` — managed via the settings tab in the admin UI

The settings tab is protected by a secondary password hardcoded in `src/App.tsx` (search `settingsPasswordInput === `).

### Payment Flow

1. Frontend POSTs to `/api/payments/create` with amount, payer info.
2. Server creates a PIX payment via Mercado Pago **Payments API** (`POST /v1/payments`) with `payment_method_id: "pix"` and `external_reference: "trilhao-{timestamp}"`.
3. Server returns `{ id: order.external_reference, orderId: String(payment.id), point_of_interaction: { transaction_data: { qr_code, qr_code_base64 } } }`. Note: `orderId` stores the numeric payment ID as a string (e.g., `"159351815316"`), not an ORD* string.
4. Frontend saves registration to Firestore with `paymentId: "trilhao-{timestamp}"`, `orderId: "<numeric>", `status: "pending"`, and navigates to `/payment/{firestoreDocId}`.
5. Mercado Pago sends a webhook with `type: "payment"`. The handler fetches the full payment, extracts `external_reference`, and searches Firestore by it to approve the registration.
6. `/api/payments/verify/:id` can manually sync (admin dashboard). Handles three formats: `ORD*` → legacy Orders API, `trilhao-*` → payments search by external_reference, numeric → Payments API.
7. Admin can cancel/refund via `POST /api/payments/cancel/:id` (Firebase Auth required). Pending → `cancelled`; Approved → calls MP refund API, then → `refunded` and restores shirt inventory.
8. On approval: confirmation email (with PDF attachment) and WhatsApp message are enqueued in `message_queue`. PIX codes (`pixCode`, `copyPaste`) are deleted from the registration document.

### PIX Regeneration

Pending registrations with expired PIX codes can have a new PIX generated via `POST /api/payments/regenerate/:docId`. This creates a new Payments API payment and updates `paymentId`, `orderId`, `pixCode`, `copyPaste` in Firestore.

### Notifications (Email + WhatsApp)

All notifications go through the `message_queue` collection and are processed asynchronously:

- **Email** (via `BREVO_API_KEY` or `RESEND_API_KEY`):
  - `pending` — sent after registration, prompts user to pay
  - `confirmation` — sent on payment approval, includes PDF comprovante + voucher QR codes
  - `term` — sent after check-in signature, includes signed term PDF
- **WhatsApp** (via Baileys library, `@whiskeysockets/baileys`):
  - Confirmation message sent on approval
  - Only sent during business hours (07h–23h Brasília)
  - Includes warmup system (graduated daily limits) to avoid bans
  - Session and ban state persisted in Firestore so restarts don't disconnect

### Check-in & Vouchers

- `/checkin/:id` — the QR code in the confirmation email/PDF leads here. Shows participant data and collects digital signature for the responsibility term.
- `POST /api/checkin/:id` — marks `checkedIn: true` (admin token required)
- `POST /api/checkin/:id/sign` — saves `termsSignature` (data URL), triggers auto-email with term PDF
- Lunch vouchers: purchased during registration, one per companion. Each voucher has a unique `code`. Validated at event via `/validar-voucher/:docId/:code` → `POST /api/voucher/:docId/:code/use`.

## API Routes (server.ts)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | Health check |
| GET | `/api/registrations/check-cpf` | — | CPF duplicate check |
| POST | `/api/payments/create` | — | Create PIX payment |
| POST | `/api/payments/regenerate/:docId` | — | Regenerate expired PIX for pending registration |
| GET | `/api/payments/verify/:id` | Admin | Manually sync payment status |
| POST | `/api/payments/cancel/:id` | Admin | Cancel or refund registration |
| GET | `/api/payments/receipt/:id` | — | Download confirmation PDF |
| POST | `/api/email/pending/:id` | — | Trigger pending email |
| POST | `/api/email/confirmation/:id` | Admin | Resend confirmation email |
| GET | `/api/qrcode/:id` | — | Generate check-in QR code PNG |
| POST | `/api/checkin/:id` | Admin | Mark check-in |
| POST | `/api/checkin/:id/sign` | Admin | Save responsibility term signature |
| POST | `/api/checkin/:id/send-term` | Admin | Resend signed term email |
| POST | `/api/voucher/:docId/:code/use` | Admin | Mark voucher as used |
| GET | `/api/whatsapp/status` | Admin | WA connection status + QR |
| POST | `/api/whatsapp/disconnect` | Admin | Disconnect WA |
| POST | `/api/whatsapp/reconnect` | Admin | Reconnect WA (fresh session) |
| POST | `/api/messages/:id/retry` | Admin | Retry failed queue message |
| POST | `/api/admin/heal-number/:docId` | Admin | Assign next available number to a registration missing one |
| POST | `/api/webhook/mercadopago` | HMAC | MP payment webhook |

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

Email (at least one required for email notifications):
```
BREVO_API_KEY=                  # Brevo transactional email API key (preferred)
RESEND_API_KEY=                 # Resend API key (fallback if BREVO_API_KEY absent)
EMAIL_FROM=                     # Sender address (e.g. noreply@trilhaobeneficente.com.br)
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
- **Rate limiting**: `paymentCreateLimiter` (5 req/min) on `/api/payments/create` and `/api/payments/regenerate/:docId`; `paymentVerifyLimiter` (20 req/min) on verify, cancel, check-cpf, and most admin endpoints.
- **Webhook signature**: `verifyMpWebhookSignature()` in `server.ts` verifies HMAC-SHA256 using `WEBHOOK_SECRET`. If `WEBHOOK_SECRET` is unset, verification is skipped (dev mode).
- **CORS**: configured with `ALLOWED_ORIGINS` env var + `APP_URL`. In production, set both to avoid CORS errors.
- **Firestore `settings/registration_counter`**: write is restricted — only `{ lastNumber: int > 0 }` is allowed. The client uses `tx.set(counterRef, { lastNumber: nextNumber })` inside a transaction.
- **WhatsApp session**: stored in `/tmp/.wa-session` on disk and mirrored to `settings/whatsapp_session` in Firestore. On Railway restarts, the session is restored from Firestore. The warmup schedule (graduated daily limits) is also persisted there.
- **`verifyAdminToken()` scope**: the server-side admin check (used in all protected endpoints) only validates against `ADMIN_EMAIL` env var and `admins/{uid}` Firestore doc — it does **not** check `settings/allowed_admins`. Users added via the UI allowed_admins list can access the frontend admin panel but cannot call server-side admin endpoints (cancel, refund, etc.).
- **check-cpf security**: `/api/registrations/check-cpf` returns only `{ duplicate, status, registrationNumber }` — never the Firestore document ID. This prevents a CPF → docId → PII attack chain via the receipt PDF endpoint.
- **`isValidRegistration` key limit**: set to `size() <= 42` (raised from 38 to accommodate audit fields like `nameEditedAt`, `nameEditedBy`). Raise further if new optional fields are added.
- **Admin name edit**: client-side `updateDoc` on `registrations/{id}` is allowed by Firestore rules when `affectedKeys` includes `name`, `nameEditedAt`, or `nameEditedBy`. Password `"475869"` is verified client-side only — same pattern as the settings tab.
- **`nextEventPrice` / `priceChangeDate`**: informational only — used to render the price-change text in the hero card. They do **not** affect payment validation. Admin must manually update `eventPrice` when the change date arrives.

## Mercado Pago Integration Guidelines

MCP Server configured at `https://mcp.mercadopago.com/mcp` (transport: HTTP). Always use it when working on payment features:

- Before answering about payments, consult the MCP with `search_documentation`.
- After implementing payment features, validate with `quality_checklist`.
- **siteId: MLB** (Brazil) in all API calls.
- The codebase uses the **Payments API** (`POST /v1/payments`, `GET /v1/payments/:id`) for PIX creation and lookup. The **Orders API** (`GET /v1/orders/:id`) exists in `api/_lib/mercadopago.ts` but is only used for legacy registrations that still have `ORD*` orderIds.
- For test credentials, use `APP_USR-` prefix, not `TEST-`. Never hardcode tokens; always read from env vars.
- Access token is server-side only (`MERCADO_PAGO_ACCESS_TOKEN`). Public key is client-side only (`VITE_MERCADO_PAGO_PUBLIC_KEY`).

## Webhook / Payment ID Strategy

Webhook notifications arrive as `type: "payment"` (with a numeric payment ID). The only reliable shared identifier is `external_reference` (set to `"trilhao-{timestamp}"` at payment creation).

- `paymentId` in Firestore = `"trilhao-{timestamp}"` (the `external_reference`)
- `orderId` in Firestore = the numeric payment ID as a string (e.g., `"159351815316"`) for new registrations; legacy registrations may have `"ORD01..."` from the old Orders API
- Verify endpoint handles three ID formats: `ORD*` → Orders API (legacy), `trilhao-*` → payments search by external_reference, numeric → Payments API

## Production Deployment (Railway)

- **URL**: `https://trilhao-web-production.up.railway.app`
- **Project**: `trilhao-beneficente` (ID `00b510f4-e7f5-4734-b6fa-94b992daeb06`)
- **Service**: `trilhao-web` (ID `7a7d956b-918d-4b76-b95d-5412b3e28a9a`)
- Deploy: `railway up --detach` (uploads local files) or push to GitHub if GitHub integration is set up
- Node >=20 per `package.json` engines; Railway is configured to run Node 24.
- **MP Webhook** subscribed to `payment` topic at `https://trilhao-web-production.up.railway.app/api/webhook/mercadopago`.
- Always send the admin URL to the user after a deploy: `https://trilhao-web-production.up.railway.app/admin`

## Firestore Rules Deployment

Firebase CLI login does not persist across terminals easily. Deploy rules programmatically using `api/_lib/firebase-admin.ts` service account credentials and the Firebase Rules REST API (`firebaserules.googleapis.com`). See the PowerShell script approach used previously: create a ruleset via `POST /v1/projects/{id}/rulesets`, then update the release via `PATCH /v1/projects/{id}/releases/cloud.firestore`.
