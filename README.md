# EcomLens Pro Max

Monorepo for EcomLens Pro Max — the online-activated edition of EcomLens.

- [`desktop/`](desktop) — the Electron desktop app. Barcode-scan-triggered product video recording, gated behind a one-time online license activation, usable offline afterward. See [`desktop/DEVELOPER.md`](desktop/DEVELOPER.md).
- [`api/`](api) — the backend that issues and validates those licenses (accounts, Razorpay purchase + invoicing, activation), plus an internal admin dashboard (`/admin`) for revenue, invoices, and invoice resend. See [`api/README.md`](api/README.md).

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
