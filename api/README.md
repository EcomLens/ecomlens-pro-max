# ecomlens-api

Backend service for EcomLens Pro Max — accounts, desktop license activation, an admin dashboard, and (future) web credits/billing, all off one shared customer/account system.

Part of the [ecomlens-pro-max](../) monorepo — see [`../desktop`](../desktop) for the client this serves.

## What's here (Phase 1 + admin dashboard)

- **Accounts** — signup/login, shared by desktop licensing and the future web tier. Login issues a JWT session token.
- **Desktop license purchase** — creates a Razorpay Invoice (hosted payment page + automatic invoice email) for the EcomLens Pro Max one-time license.
- **Webhook handler** — verifies Razorpay's signature on `invoice.paid` and activates the corresponding license.
- **Activation endpoint** — called by the desktop app to redeem a key and, afterward, to periodically re-validate in the background.
- **Admin dashboard** (`/admin`) — total licenses issued, revenue (total / by customer / by day), full invoice history, and one-click invoice resend. Gated behind an `isAdmin` account flag.

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
| GET | `/health` | Liveness check |

Admin routes require `Authorization: Bearer <token>` from a login response where `isAdmin: true`.

**Note on "resend to a different email":** the resend endpoint uses Razorpay's own notify-by-email, which only sends to the invoice's original customer email. Resending to an arbitrary different address isn't built yet — it would need its own email-service integration (SMTP/Resend/SendGrid), same TODO already noted for sending the license key itself.

## Webhook setup

In the Razorpay Dashboard under Settings → Webhooks, point a webhook at `<deployed-url>/api/webhooks/razorpay` for the `invoice.paid` event, and set `RAZORPAY_WEBHOOK_SECRET` in `.env` to match the secret you choose there.

## Roadmap

Phases 2-4 (web scanning app, credit-based billing, partner integration API with webhooks) are planned but not yet built — see [`../README.md`](../README.md) for the full phased plan.
