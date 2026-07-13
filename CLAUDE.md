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
- `/checkin/:id` — `CheckInPage`: scan QR on arrival, shows registration data and a button to proceed to terms.
- `/checkin/:id/termos` — `TermsPage`: displays the responsibility term text and captures digital signature (data URL); triggers auto-email with signed term PDF.
- `/scanner` — `ScannerPage`: camera-based QR code scanner (uses `jsqr`) with a fallback CPF/registration-number search (`GET /api/checkin/lookup-cpf`) for attendees without a printed/digital QR, plus a check-in report view.
- `/validar-voucher/:docId/:code` — Admin-facing voucher validation page (mark lunch voucher as used).
- `/admin` — `AdminDashboard`: Google Auth + admin check, then tabs: `dashboard` (stats), `registrations` (management, with Excel export via `xlsx`, includes the cash on-site registration modal), `financeiro` (PIX vs. cash revenue report, MP fee breakdown, daily chart), `vouchers`, `terms`, `mensagens` (email/WhatsApp queue), `campanhas` (WhatsApp marketing), `settings`.

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
| `whatsapp.ts` | `initEmailWorker(db)`, `enqueueMessage()`, `enqueueWhatsAppMessage()`, `buildConfirmationMessage()`, `retryMessage()` — unified message queue worker (email + WhatsApp). Baileys removed; WA sending delegates to `whatsappMeta.ts`. |
| `whatsappMeta.ts` | `sendWhatsAppTemplate()`, `sendWhatsAppTextMessage()`, `sendConfirmationWhatsApp()`, `normalizeBrPhone()`, `getMetaWhatsAppConfigStatus()`, `whatsappTemplates` — Meta WhatsApp Cloud API integration. Template `confirmacao_trilhao` (4 params: nome, shirtSize, evento, numeroInscricao). Gated by `WHATSAPP_ENABLED` + `WHATSAPP_DRY_RUN` flags (both default safe). |

### Firestore Collections

| Collection | Purpose |
|---|---|
| `registrations` | Participant records. Fields: `status` (`pending`/`approved`/`cancelled`/`refunded`), `paymentId`, `orderId`, `pixCode` (base64), `copyPaste` (PIX code), `confirmedAt`, `cancelledAt`, `refundedAt`, `refundId`, `shirtSize`, `registrationNumber`, `checkedIn`, `checkedInAt`, `termsSigned`, `termsSignedAt`, `termsSignature` (data URL), `vouchers[]` ({`name`, `code`, `used`, `usedAt`, `cancelled`, `cancelledAt`}), `cancelOperatorEmail`, `cancelOperatorName`, `refundOperatorEmail`, `refundOperatorName` (audit — set on cancel/refund), `nameEditedAt`, `nameEditedBy` (audit — set when admin edits name), `inventoryReserved: boolean` (set when stock is decremented at pending creation), `remindersSent: number` (0–4, tracks escalating payment reminder emails sent), `pixExpiresAt: string` (ISO — set at registration creation and manual PIX regeneration; PaymentPage uses this for the countdown, fallback to `createdAt + 30min` for legacy records), `paymentMethod: "cash"` (only set for on-site cash registrations — absent/undefined means PIX), `cashOperatorEmail`, `cashOperatorName` (audit — set on cash registration). |
| `payment_logs` | Webhook audit log, last 50 shown in admin. |
| `admins` | Documents keyed by Firebase UID granting admin access. |
| `message_queue` | Unified notification queue for both `email` and `whatsapp` channels. Fields: `channel`, `status` (`pending`/`sending`/`sent`/`retry`/`failed`/`dry_run`/`disabled`), `emailType` (`confirmation`/`pending`/`term`/`reminder1`/`reminder2`/`reminder3`/`reminder4`/`cancelled_auto`, `null` for campaign sends), `registrationId` (`null` for campaign sends), `templateName`/`templateParams` (set instead of `emailType` for WhatsApp campaign messages — see [WhatsApp Marketing Campaigns](#whatsapp-marketing-campaigns)), `metaMessageId` (returned by Meta API on send), `attempts`, etc. Processed by workers in `api/_lib/whatsapp.ts`. |
| `settings/registration_counter` | Auto-increment counter for `registrationNumber`. Write restricted to `{ lastNumber: int > 0 }`. |
| `settings/shirt_inventory` | Per-size available shirt counts (`P`, `M`, `G`, `GG`, `XGG`, `EX`). Decremented on approval, incremented on refund. |
| `settings/shirt_inventory_total` | Admin-configured total per size. `reserved = total - available`. Read/write: admin only. |
| `settings/event_config` | Event-level config: `allowMultipleCpf: boolean`, `eventPrice: number`, `voucherPrice: number`, `nextEventPrice: number` (próximo valor após reajuste), `priceChangeDate: string` (ISO date — último dia do valor atual). Read publicly (formulário), write admin only. |
| `settings/allowed_admins` | `emails: string[]` — extra admin emails managed via the settings tab UI. |
| `settings/whatsapp_config` | `sendEnabled: boolean` (global pause/resume toggle) and `flows: Record<string, boolean>` (per-`emailType`/`"campaign"` send toggles) — managed from the admin Configurações tab. |
| `settings/whatsapp_daily_stats` | `{ date, sentCount }` — resets daily, used to enforce `WA_DAILY_LIMIT` (250 msgs/day). |

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

### Cash On-Site Registration

`POST /api/admin/registrations/cash` (admin-only) creates a registration paid in cash at the event, bypassing PIX entirely: writes `status: "approved"` and `paymentMethod: "cash"` directly (no `pending` step, no webhook), decrements shirt inventory immediately, and enqueues the confirmation email/WhatsApp like a normal approval. Same CPF-duplicate check as the public form (blocks only on active `pending`/`approved`). The admin `financeiro` tab's revenue report separates PIX vs. cash totals and only applies the Mercado Pago fee (`MP_FEE_RATE`) to PIX transactions, since cash never touches the payment processor.

### PIX Regeneration

Pending registrations with expired PIX codes can have a new PIX generated via `POST /api/payments/regenerate/:docId`. This creates a new Payments API payment and updates `paymentId`, `orderId`, `pixCode`, `copyPaste` in Firestore.

### Automatic Payment Reminders

`startReminderWorker()` runs every 30 minutes in `server.ts`. For each pending registration it:
1. Auto-cancels and restores inventory after 24h (sends `cancelled_auto` email)
2. Sends escalating reminders: +1h → `reminder1`, +6h → `reminder2`, +12h → `reminder3`, +20h → `reminder4`
3. Uses `remindersSent` field to ensure idempotency (each level only sent once)
4. `isRunning` guard prevents concurrent runs

The worker does **not** regenerate PIX — the original PIX has `date_of_expiration: 24h` set at creation and stays valid for the entire pending window. Reminder emails link to `/payment/:id` where the user finds the same QR.

### Stock Reservation on Pending Registration

When `POST /api/email/pending/:id` runs, it decrements `shirt_inventory` and sets `inventoryReserved: true` on the registration (idempotent). Downstream effects:
- `approveRegistration`: only decrements inventory if `!inventoryReserved` (avoids double-decrement)
- Cancelling a pending registration: restores inventory if `inventoryReserved`
- `autoCancelRegistration` (24h timeout): same restoration logic

### Notifications (Email + WhatsApp)

All notifications go through the `message_queue` collection and are processed asynchronously:

- **Email** (via `BREVO_API_KEY` or `RESEND_API_KEY`):
  - `pending` — sent after registration, prompts user to pay
  - `reminder1`/`reminder2`/`reminder3`/`reminder4` — escalating payment reminders at +1h/+6h/+12h/+20h
  - `cancelled_auto` — auto-cancellation notification after 24h without payment
  - `confirmation` — sent on payment approval, includes PDF comprovante + voucher QR codes
  - `term` — sent after check-in signature, includes signed term PDF
- **WhatsApp** (via Meta WhatsApp Cloud API, `api/_lib/whatsappMeta.ts`):
  - Confirmation message sent on approval via template `confirmacao_trilhao` (4 params: nome, shirtSize, evento, numeroInscricao)
  - Gated by `WHATSAPP_ENABLED` (default `false`) and `WHATSAPP_DRY_RUN` (default `true`) — safe by default, no messages sent unless both are configured
  - `WHATSAPP_DRY_RUN=true` logs but does not call Meta API; queue entry gets status `dry_run`
  - `WHATSAPP_ENABLED=false` skips entirely; queue entry gets status `disabled`
  - Webhook status updates (`delivered`/`read`/`failed`) received at `POST /api/whatsapp/webhook` and written back to `message_queue` as `metaStatus_*` fields
  - `settings/whatsapp_config` doc controls sending at runtime: `sendEnabled: boolean` (admin-facing pause/resume toggle, checked once per worker cycle) and `flows: Record<string, boolean>` for per-message-type toggles (keyed by `emailType`, or `"campaign"` for bulk sends) — a missing key defaults to enabled (`isFlowEnabled()` in `api/_lib/whatsapp.ts`)
  - `WA_DAILY_LIMIT = 250` messages/day (Meta free-tier conversation cap), tracked in `settings/whatsapp_daily_stats` (`{ date, sentCount }`); the queue worker stops draining once the limit is hit and resumes the next day

### WhatsApp Marketing Campaigns

`POST /api/admin/campanha/whatsapp` (admin-only) bulk-enqueues WhatsApp template messages to an arbitrary contact list (e.g. past participants from an Excel upload in the admin "Campanhas" screen), independent of any registration. Body: `{ contacts: [{ nome, telefone }], templateName, templateParam2 }`. Phone numbers are normalized to `55` + digits; first name is extracted for the template's first param. Enqueued via `enqueueCampaignBatch()`, which writes directly to `message_queue` with `registrationId: null` and `emailType: null` (queue entries are distinguished from transactional messages by having `templateName` set) — subject to the same `sendEnabled`, `flows["campaign"]`, and `WA_DAILY_LIMIT` gates as transactional WhatsApp sends.

### Check-in & Vouchers

- `/checkin/:id` — the QR code in the confirmation email/PDF leads here. Shows participant data and collects digital signature for the responsibility term.
- `POST /api/checkin/:id` — marks `checkedIn: true` (admin token required)
- `POST /api/checkin/:id/sign` — saves `termsSignature` (data URL), triggers auto-email with term PDF
- Lunch vouchers: purchased during registration, one per companion. Each voucher has a unique `code`. Validated at event via `/validar-voucher/:docId/:code` → `POST /api/voucher/:docId/:code/use`.

## API Routes (server.ts)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | Health check |
| GET | `/api/registrations/check-cpf` | — | CPF duplicate check (returns prefill data for cancelled/refunded) |
| POST | `/api/registrations/resend-confirmation` | — | Resend confirmation email by CPF (rate-limited) |
| GET | `/api/registrations/receipt-by-cpf` | — | Download confirmation PDF by CPF (rate-limited) |
| GET | `/api/checkin/lookup-cpf` | — | Scanner fallback: find registration by CPF when no QR is available (rate-limited) |
| POST | `/api/payments/create` | — | Create PIX payment |
| POST | `/api/payments/regenerate/:docId` | — | Regenerate expired PIX for pending registration |
| GET | `/api/payments/verify/:id` | Admin | Manually sync payment status |
| POST | `/api/payments/cancel/:id` | Admin | Cancel or refund registration |
| POST | `/api/admin/registrations/cash` | Admin | Create an approved registration paid in cash on-site (no PIX) |
| GET | `/api/payments/receipt/:id` | — | Download confirmation PDF |
| POST | `/api/email/pending/:id` | — | Trigger pending email |
| POST | `/api/email/confirmation/:id` | Admin | Resend confirmation email |
| GET | `/api/qrcode/:id` | — | Generate check-in QR code PNG |
| POST | `/api/checkin/:id` | Admin | Mark check-in |
| POST | `/api/checkin/:id/sign` | Admin | Save responsibility term signature |
| POST | `/api/checkin/:id/send-term` | Admin | Resend signed term email |
| GET | `/api/checkin/:id/term-pdf` | Admin | Download signed term PDF |
| POST | `/api/voucher/:docId/:code/use` | Admin | Mark voucher as used |
| GET | `/api/whatsapp/status` | Admin | Meta WA config status (env vars presence, enabled/dryRun flags) |
| GET | `/api/whatsapp/webhook` | — | Meta webhook verification (hub.mode/hub.challenge handshake) |
| POST | `/api/whatsapp/webhook` | HMAC | Meta webhook events (delivery status updates) |
| POST | `/api/messages/:id/retry` | Admin | Retry failed queue message |
| POST | `/api/admin/campanha/whatsapp` | Admin | Bulk-enqueue WhatsApp campaign messages to an arbitrary contact list |
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

WhatsApp (Meta Cloud API — defaults are safe/disabled):
```
WHATSAPP_ENABLED=              # "true" to enable sending (default: false)
WHATSAPP_DRY_RUN=              # "false" to send real messages (default: true)
META_GRAPH_VERSION=            # Graph API version (default: v20.0)
WHATSAPP_ACCESS_TOKEN=         # Permanent access token (Meta for Developers > WhatsApp > API Setup)
WHATSAPP_PHONE_NUMBER_ID=      # Phone Number ID from Meta for Developers
WHATSAPP_BUSINESS_ACCOUNT_ID=  # Business Account ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN= # Random string; must match what you set in Meta webhook panel
META_APP_SECRET=               # App Secret for webhook HMAC validation (Meta > Configurações > Básico)
```

## Key Constraints

- **`firebase-applet-config.json`** must exist at repo root — it contains Firebase client config and the named Firestore database ID. Not in `.gitignore`, intentionally committed.
- The Mercado Pago webhook only fires for HTTPS non-localhost `APP_URL`; in local dev the webhook path must be tested manually via `verify/:id`.
- `npm run lint` is the only automated check. Run it before committing to catch type errors.
- **BOM divergence**: `server.ts` strips the UTF-8 BOM from `FIREBASE_SERVICE_ACCOUNT_KEY` (`replace(/^﻿/, "")`) before `JSON.parse`; `api/_lib/firebase-admin.ts` does not. Keep this in sync if modifying either.
- **`@google/genai`** and **`nodemailer`** are unused dependencies (leftover from project template). `GEMINI_API_KEY` in `.env.example` is similarly unused — do not add Gemini features unless explicitly requested.
- **Rate limiting**: `paymentCreateLimiter` (5 req/min) on `/api/payments/create` and `/api/payments/regenerate/:docId`; `paymentVerifyLimiter` (20 req/min) on verify, cancel, check-cpf, and most admin endpoints; `cpfPublicLimiter` on `/api/registrations/resend-confirmation` and `/api/registrations/receipt-by-cpf`.
- **Webhook signature**: `verifyMpWebhookSignature()` in `server.ts` verifies HMAC-SHA256 using `WEBHOOK_SECRET`. If `WEBHOOK_SECRET` is unset, verification is skipped (dev mode).
- **CORS**: configured with `ALLOWED_ORIGINS` env var + `APP_URL`. In production, set both to avoid CORS errors.
- **Firestore `settings/registration_counter`**: write is restricted — only `{ lastNumber: int > 0 }` is allowed. The client uses `tx.set(counterRef, { lastNumber: nextNumber })` inside a transaction.
- **WhatsApp Meta safety flags**: `WHATSAPP_ENABLED` defaults to `false` and `WHATSAPP_DRY_RUN` defaults to `true`. Both must be set to send real messages. In production without `META_APP_SECRET`, the server logs a security error but does not crash. The webhook endpoint at `/api/whatsapp/webhook` uses `WHATSAPP_WEBHOOK_VERIFY_TOKEN` for the GET handshake and `META_APP_SECRET` for POST HMAC validation.
- **`verifyAdminToken()` scope**: the server-side admin check (used in all protected endpoints, in both `server.ts` and the `api/payments/cancel`/`api/payments/verify` handlers) validates against `ADMIN_EMAIL` env var, `admins/{uid}` Firestore doc, and (as a fallback, one extra read only when the first two miss) `settings/allowed_admins.emails` — kept in sync with the frontend admin gate so UI-only admins can actually call protected endpoints (cancel, refund, cash registration, etc.).
- **check-cpf security**: `/api/registrations/check-cpf` returns only `{ duplicate, status, registrationNumber, prefill? }` — never the Firestore document ID. Scans up to 10 registrations; blocks if any is `pending`/`approved`; returns `prefill` with form data from the most recent `cancelled`/`refunded` registration so the user doesn't have to retype. This prevents a CPF → docId → PII attack chain via the receipt PDF endpoint.
- **`isValidRegistration` key limit**: set to `size() <= 42`. New optional fields must be added to `firestore.rules` as `(!('field' in data) || data.field is <type>)` — raise the size limit only if a CREATE document would exceed 42 keys (currently ~28 keys).
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
