# EcomLens Pro Max

Monorepo for EcomLens Pro Max — the online-activated edition of EcomLens, sold two ways: a one-time desktop license, or a pay-per-scan web app. Both share one backend, one accounts system, and the same scan-triggered recording engine.

- [`desktop/`](desktop) — the Electron desktop app, one-time purchase, activated online then usable offline. **Features:** [`desktop/README.md`](desktop/README.md#-key-features) · **Architecture:** [`desktop/DEVELOPER.md`](desktop/DEVELOPER.md)
- [`api/`](api) — the backend (accounts, Razorpay licensing + invoicing, admin dashboard), plus the browser-based web app (`/app`) and the public marketing/purchase page (`/`) intended for `ecomlens.jinzy.com`. **Web app features:** [`api/README.md`](api/README.md#-web-app--key-features-app) · **Architecture:** [`api/DEVELOPER.md`](api/DEVELOPER.md)

## Relationship to other EcomLens repos

- [`EcomLens/ecomlens-desktop`](https://github.com/EcomLens/ecomlens-desktop) — the original app.
- [`EcomLens/ecomlens-pro`](https://github.com/EcomLens/ecomlens-pro) — an earlier upgraded edition (bug fixes, restructuring), kept as-is with the old admin-secret signup gate.
- **This repo** — builds on `ecomlens-pro`'s codebase, replacing the admin-secret gate with real online license activation via Razorpay, and adds the backend that powers it.

## Quick start

```bash
# Backend
cd api && npm install && cp .env.example .env  # fill in Razorpay keys
npx prisma migrate dev
npm run dev

# Desktop app (separate terminal)
cd desktop && npm install
npm start
```
