# ecomlens-api

Backend service for EcomLens Pro Max — accounts, desktop license activation, an admin dashboard, the web scanning app, and the public marketing site, all off one shared customer/account system.

Part of the [ecomlens-pro-max](../) monorepo — see [`../desktop`](../desktop) for the desktop client this also serves. For architecture, the request/auth model, database schema, and known quirks, see [DEVELOPER.md](DEVELOPER.md).

**Built with:** Node.js + Express 5 · Prisma 5 + SQLite (Postgres-ready) · Razorpay SDK · JWT sessions · vanilla HTML/CSS/JS on the frontend, no framework or build step. Full breakdown in [DEVELOPER.md](DEVELOPER.md#tech-stack).

---

## ✨ Web App — Key Features (`/app`)

- **Login & Signup** — same accounts system as the desktop app; log in from any browser, no install
- **Camera + Scanner Detection** — automatic connection status for both, same detection logic as the desktop app
- **Barcode-Triggered Recording** — scanning a barcode starts recording automatically; scanning again stops it and starts the next
- **Pay-Per-Scan Ready** — every recording's barcode + timestamp is logged to the account (video itself never leaves your machine), laying the groundwork for credit-based billing
- **Works in Any Browser** — recordings save via a normal browser download, no special permissions or Chromium-only APIs required
- **Recent Recordings** — a live list of what's been scanned today, pulled from the account's own history

*Desktop app features live in [`../desktop/README.md`](../desktop/README.md).*

---

## What's here

- **Accounts** — signup/login, shared by desktop licensing and the web app. Login issues a JWT session token.
- **Desktop license purchase** — creates a Razorpay Invoice (hosted payment page + automatic invoice email) for the EcomLens Pro Max one-time license.
- **Webhook handler** — verifies Razorpay's signature on `invoice.paid` and activates the corresponding license.
- **Activation endpoint** — called by the desktop app to redeem a key and, afterward, to periodically re-validate in the background.
- **Admin dashboard** (`/admin`) — total licenses issued, revenue (total / by customer / by day), full invoice history, and one-click invoice resend. Gated behind an `isAdmin` account flag.
- **Marketing landing page** (`/`) — SEO-tagged (meta description, Open Graph, Twitter Card, JSON-LD `SoftwareApplication` schema, `robots.txt`, `sitemap.xml`), presents the Desktop Pro Max and Web (pay-per-scan) purchase paths side by side, a bilingual (English/Hindi) demo video that loads nothing until played, and a "Download for Windows" CTA wired to `/api/license/purchase` directly. Pricing shown is placeholder.
- **Web scanning app** (`/app`) — browser-based version of the scan-triggered recording flow (login/signup, camera + scanner connection detection, barcode-triggered recording start/stop). Recordings save via plain browser download (works in any browser; the polished Chromium-only folder-picker alternative was considered and deliberately not used). Recording metadata (barcode + timestamp, never the video itself) is logged to `Recording` so Phase 3 (credit billing) and Phase 4 (partner API) don't need retrofitting later.

## Setup

```bash
npm install
cp .env.example .env   # fill in RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET / JWT_SECRET
npx prisma migrate dev
npm run dev
```

Uses SQLite locally (zero setup). For production, switch `provider` in `prisma/schema.prisma` to `postgresql` and point `DATABASE_URL` at a real Postgres instance — no other code changes needed.

### Getting admin access

There's no signup flow for admins on purpose. Sign up a normal account, then promote it:

```bash
npm run make-admin -- you@example.com
```

Then visit `/admin` (e.g. `http://localhost:4000/admin/`) and log in with that account.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Login (returns a JWT for admin dashboard access) |
| POST | `/api/license/purchase` | Create a Razorpay invoice for a desktop license |
| POST | `/api/license/activate` | Redeem/validate a license key (called by the desktop app) |
| POST | `/api/webhooks/razorpay` | Razorpay webhook receiver (signature-verified) |
| GET | `/api/admin/summary` | Total licenses issued, active licenses, total revenue, customer counts (admin only) |
| GET | `/api/admin/revenue/by-customer` | Revenue grouped by customer (admin only) |
| GET | `/api/admin/revenue/by-day` | Revenue grouped by day (admin only) |
| GET | `/api/admin/invoices` | Full invoice/purchase history (admin only) |
| POST | `/api/admin/invoices/:id/resend` | Resend the original invoice to the original customer via Razorpay (admin only) |
| POST | `/api/recordings` | Log a completed web-app recording's metadata (barcode, timestamp) against the logged-in account |
| GET | `/api/recordings` | List the logged-in account's recent recordings |
| GET | `/health` | Liveness check |

`/api/recordings/*` requires `Authorization: Bearer <token>` from any logged-in account (not admin-only, unlike `/api/admin/*`).

Admin routes require `Authorization: Bearer <token>` from a login response where `isAdmin: true`.

**Note on "resend to a different email":** the resend endpoint uses Razorpay's own notify-by-email, which only sends to the invoice's original customer email. Resending to an arbitrary different address isn't built yet — it would need its own email-service integration (SMTP/Resend/SendGrid), same TODO already noted for sending the license key itself.

## Webhook setup

In the Razorpay Dashboard under Settings → Webhooks, point a webhook at `<deployed-url>/api/webhooks/razorpay` for the `invoice.paid` event, and set `RAZORPAY_WEBHOOK_SECRET` in `.env` to match the secret you choose there.

## Roadmap

The web app's core scanning/recording flow (Phase 2) is built. Credit-based billing for it (Phase 3) and the partner integration API with webhooks (Phase 4) are still ahead — see [`../README.md`](../README.md) for the full phased plan.

One small gap: `og:image` in the landing page's `<head>` points at `/og-image.png`, which doesn't exist yet (attempted to generate one but the available tooling in this environment couldn't reliably render/rasterize it — not worth blocking on). Add a real 1200×630 branded image at `public/og-image.png` before the site goes live, or social share previews will show a broken image.
