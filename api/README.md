# ecomlens-api

Backend service for EcomLens Pro Max — accounts, desktop license activation, and (future) web credits/billing, all off one shared customer/account system.

## What's here (Phase 1)

- **Accounts** — signup/login, shared by desktop licensing and the future web tier.
- **Desktop license purchase** — creates a Razorpay Invoice (hosted payment page + automatic invoice email) for the EcomLens Pro Max one-time license.
- **Webhook handler** — verifies Razorpay's signature on `invoice.paid` and activates the corresponding license.
- **Activation endpoint** — called by the desktop app to redeem a key and, afterward, to periodically re-validate in the background.

See the main [EcomLens Pro Max desktop app repo](https://github.com/EcomLens/ecomlens-pro) for the client this serves.

## Setup

```bash
npm install
cp .env.example .env   # fill in RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
npx prisma migrate dev
npm run dev
```

Uses SQLite locally (zero setup). For production, switch `provider` in `prisma/schema.prisma` to `postgresql` and point `DATABASE_URL` at a real Postgres instance — no other code changes needed.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Login |
| POST | `/api/license/purchase` | Create a Razorpay invoice for a desktop license |
| POST | `/api/license/activate` | Redeem/validate a license key (called by the desktop app) |
| POST | `/api/webhooks/razorpay` | Razorpay webhook receiver (signature-verified) |
| GET | `/health` | Liveness check |

## Webhook setup

In the Razorpay Dashboard under Settings → Webhooks, point a webhook at `<deployed-url>/api/webhooks/razorpay` for the `invoice.paid` event, and set `RAZORPAY_WEBHOOK_SECRET` in `.env` to match the secret you choose there.

## Roadmap

Phases 2-4 (web scanning app, credit-based billing, partner integration API with webhooks) are planned but not yet built — see the desktop app's `DEVELOPER.md` / project notes for the full phased plan.
