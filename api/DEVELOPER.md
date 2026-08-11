# ecomlens-api — Developer Documentation

Internal architecture reference. For the product-level summary see [README.md](README.md); for the desktop client this backend also serves, see [`../desktop/DEVELOPER.md`](../desktop/DEVELOPER.md).

## Tech stack

- **Node.js + Express 5** — no framework beyond that; every route is a plain `express.Router()`.
- **Prisma 5 + SQLite** for local dev. Deliberately pinned to Prisma 5 — Prisma 7 changed its config format significantly (connection URLs move out of `schema.prisma` into a separate config file); upgrading is a real migration, not a drop-in. Switching to Postgres for production is just changing `provider` in `prisma/schema.prisma` to `"postgresql"` and pointing `DATABASE_URL` at a real instance — no code changes.
- **Razorpay Node SDK** for payments (Invoice API, not Orders+Checkout — see "Why Invoices, not Orders" below).
- **`jsonwebtoken`** for session tokens (both admin-dashboard and web-app login use the same JWT shape).
- **No frontend framework anywhere.** `public/` is plain HTML/CSS/vanilla JS, matching the desktop app's own no-build-step philosophy. There is no bundler, no transpilation — what's in `public/` is what ships.

## What's actually being served, and from where

One Express app (`src/server.js`) serves four distinct surfaces:

| Path | What | Auth |
|---|---|---|
| `/` | Public marketing/purchase landing page (`public/index.html`) | none |
| `/app/*` | Browser-based scanning app for customers | JWT (any account) |
| `/admin/*` | Internal revenue/invoice dashboard | JWT (`isAdmin: true` accounts only) |
| `/api/*` | The REST API all three surfaces above call into | varies per route, see below |

All four share the same `Account` table and JWT scheme — there's no separate "customer" vs "staff" auth system, just an `isAdmin` boolean gate on top of the same login.

## Request flow / auth model

There are two Express middlewares that gate routes, both reading `Authorization: Bearer <token>`:

- **`requireAuth`** (`src/middleware/requireAuth.js`) — verifies the JWT, sets `req.accountId`. Used by `/api/recordings/*`. Any logged-in account passes.
- **`requireAdmin`** (`src/middleware/requireAdmin.js`) — same verification, additionally rejects unless the JWT's `isAdmin` claim is true. Used by `/api/admin/*`.

The JWT itself (`src/lib/jwt.js`) is signed with `JWT_SECRET`, expires in 7 days, and carries `{accountId, isAdmin}` as of whatever those values were **at login time**. This has one real consequence: revoking someone's admin flag doesn't take effect until their existing token expires (up to 7 days) — acceptable for a small number of internal admins, but know it's there if that assumption ever needs to change.

`/api/auth/login` and `/api/auth/signup` are the only unauthenticated `/api/*` routes (aside from the webhook, see below). Login always returns a token now, even for non-admin accounts — the web app and the admin dashboard both just call the same login endpoint and use the token for whatever they're authorized to do.

## Why Invoices, not Orders+Checkout

Razorpay offers two ways to collect a payment: the **Orders API** (you build your own checkout UI, embed their Checkout.js widget) or the **Invoices API** (you supply customer + line-item details, Razorpay generates and hosts the entire payment page *and* emails the invoice automatically). `src/routes/license.js`'s `/purchase` endpoint uses Invoices specifically because "generate an invoice and email it to the customer" was a stated requirement — Invoices does that natively in one API call, where Orders would've needed a hand-built checkout page plus separate invoice generation/emailing. This is why there's no custom payment form anywhere in this codebase; the landing page's "buy" modal just calls `/api/license/purchase` and redirects to the `invoiceUrl` Razorpay hands back.

## Webhook signature verification

`src/routes/webhooks.js` is mounted **before** the global `express.json()` middleware in `server.js`, with its own `express.raw({type: "application/json"})` parser:

```js
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);
app.use(express.json());
```

This ordering is load-bearing. Razorpay signs the webhook body with HMAC-SHA256 over the *exact raw bytes* of the request — if Express's JSON parser touches the body first (parsing then re-serializing it), the signature check (`Razorpay.validateWebhookSignature`) will fail even for a legitimate webhook, because the re-serialized JSON isn't byte-identical to what Razorpay signed. If you ever need to add another raw-body route, it has to go before the global `express.json()` call the same way.

On `invoice.paid`, the handler looks up the `License` by `razorpayInvoiceId`, flips it to `status: "active"`, and stamps `activatedAt`. A missing signature or a bad signature returns 400 without touching the database. An error *after* signature verification (e.g. a DB hiccup) still returns 200 — Razorpay retries on non-2xx, and a bug on our side wouldn't be fixed by Razorpay retrying the identical payload, so there's no point making it retry.

## Database schema

```
Account
  id, email (unique), passwordHash, name, isAdmin, createdAt
  -> licenses: License[]
  -> recordings: Recording[]

License          (one row per desktop Pro Max purchase attempt)
  id, key (unique), accountId, status ("pending"|"active"|"revoked")
  razorpayInvoiceId (unique), amountPaise, currency
  activatedAt, lastValidatedAt, createdAt

Recording         (metadata only - the video file itself never reaches this server)
  id, accountId, barcode, recordedAt
```

- `License.amountPaise`/`currency` are captured **at invoice-creation time**, not read back from Razorpay later — this is deliberate, so admin revenue reports (`/api/admin/revenue/*`) are plain local queries instead of needing a live Razorpay API call per report.
- `License` rows exist in `"pending"` state from the moment an invoice is created, whether or not it's ever paid — this is what makes the admin `/api/admin/invoices` list a complete purchase history, not just successful ones.
- `Recording` exists purely so Phase 3 (credit-based billing for the web app) and Phase 4 (partner API "recording done" webhook/lookup) have something to build on without a schema migration later. It is **not** currently used for anything except the web app's own "recent recordings" list.

## License key format

`src/lib/licenseKey.js` generates keys like `PROMAX-XXXX-XXXX-XXXX-XXXX` using an alphabet that excludes visually-confusable characters (`0`/`O`, `1`/`I`/`L`) — these are meant to be readable and typeable by a human, not just pasted.

## The web app's recording flow (`public/app/scan.html`)

This is a near-direct port of the desktop app's `record-scan.renderer.js` state machine (`activeBarcode`/`queuedBarcode`/`isRecording`, the camera-concurrency guard, the scanner-confirmation-via-first-scan logic) — same underlying web APIs (`getUserMedia`, `MediaRecorder`, keyboard-based barcode-scan detection), just without Electron IPC. A few web-specific differences from the desktop version:

- **No `window.ipc`.** Everything goes through `fetch()` with `Authorization: Bearer <token>` from `localStorage`.
- **Save method: plain browser download.** `saveRecordingLocally()` creates an object URL and clicks a hidden `<a download>`. This was a deliberate choice over the alternative (Chromium's File System Access API, which lets a page hold onto a chosen folder and write into it directly) — plain downloads work in every browser with zero permission prompts, at the cost of landing in the browser's default downloads folder rather than a folder the user picks once. If that tradeoff ever needs revisiting, the swap is isolated to `saveRecordingLocally()` alone.
- **No local SQLite.** Recording metadata goes to `POST /api/recordings` instead of a local database; the "recent recordings" panel reads it back from `GET /api/recordings`.
- **No tab-navigation system.** Unlike the desktop app (where a custom SPA-style router rebuilds `#view` on every tab switch, which is *why* the desktop renderers need the whole init/destroy re-registration pattern documented in `../desktop/DEVELOPER.md`), this is a plain multi-page site — navigating to `/app/scan.html` is a real page load, so none of that complexity applies here. Top-level `<script>` (not a module) means functions attach to `window` normally.

## Build / run

```bash
npm install
cp .env.example .env   # RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET / JWT_SECRET / PRO_MAX_LICENSE_PRICE_PAISE
npx prisma migrate dev
npm run dev             # node --watch src/server.js
```

`npm run make-admin -- someone@example.com` promotes an existing account to `isAdmin: true` (that account must have signed up first via `/api/auth/signup` — there's no separate admin-creation flow).

## Known quirks / TODOs worth knowing before you touch things

- **`og:image` in the landing page points at `/og-image.png`, which doesn't exist.** A generation attempt was made (rendering a branded 1200×630 page and screenshotting it) but the available tooling in this dev environment couldn't reliably rasterize it. Not urgent — nothing fetches it until the site is actually deployed — but add a real file at `public/og-image.png` before that happens, or social share previews will show a broken image.
- **No email service wired up.** Two things depend on one: (1) emailing the license key itself after a desktop purchase — Razorpay's invoice email is just the payment receipt, not the product key; (2) resending an invoice to a *different* email than the original purchaser (the current `/api/admin/invoices/:id/resend` only re-sends to the original email via Razorpay's own notify endpoint, which is all Razorpay supports natively). Needs an SMTP/Resend/SendGrid choice + credentials.
- **`apiBaseUrl` in the desktop app is still `http://localhost:4000`.** This backend isn't deployed anywhere public yet - see `../desktop/DEVELOPER.md`'s Known Quirks for the desktop-side half of this.
- **Prisma is pinned to v5, not upgraded to v7.** See the Tech Stack section above - this was a deliberate compatibility decision, not an oversight.
- **`Recording` isn't enforced against anything yet.** Any logged-in account can log unlimited recordings via `POST /api/recordings` - there's no credit balance, no quota, no billing check. That's Phase 3, not built yet.
