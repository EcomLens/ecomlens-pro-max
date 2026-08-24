-- Adds an admin-only per-license escape hatch from the one-device-per-license
-- rule, for internal/business-owner use (e.g. warehouse computers) rather
-- than regular customer licenses. Purely additive, defaults to false for
-- every existing row.
ALTER TABLE "License" ADD COLUMN "unlimitedDevices" BOOLEAN NOT NULL DEFAULT false;
