const express = require("express");
const prisma = require("../lib/prisma");
const razorpay = require("../lib/razorpay");
const { generateLicenseKey } = require("../lib/licenseKey");
const { verifyPassword } = require("../lib/passwords");
const { signDeviceCertificate } = require("../lib/licenseSigning");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// Starts a desktop Pro Max license purchase. Creates the account if it
// doesn't exist yet, creates a "pending" License row, then asks Razorpay to
// generate + host an invoice (which Razorpay emails to the customer itself).
// The webhook in webhooks.js is what actually activates the license once
// Razorpay confirms payment - nothing here grants access.
router.post("/purchase", async (req, res) => {
    const { email, name } = req.body || {};
    if (!email) {
        return res.status(400).json({ status: false, msg: "email is required" });
    }

    try {
        let account = await prisma.account.findUnique({ where: { email } });
        if (!account) {
            // No password set yet for purchase-first signups - the customer
            // sets one when they first log in to retrieve their key/activate.
            account = await prisma.account.create({
                data: { email, name: name || null, passwordHash: "" },
            });
        }

        const license = await prisma.license.create({
            data: { key: generateLicenseKey(), accountId: account.id, status: "pending" },
        });

        const priceInPaise = Number(process.env.PRO_MAX_LICENSE_PRICE_PAISE || 999900);

        const invoice = await razorpay.invoices.create({
            type: "invoice",
            customer: { name: name || email, email },
            line_items: [
                {
                    name: "EcomLens Pro Max - Desktop License",
                    amount: priceInPaise,
                    currency: "INR",
                    quantity: 1,
                },
            ],
            currency: "INR",
            email_notify: 1,
            sms_notify: 0,
            notes: { licenseId: license.id },
        });

        await prisma.license.update({
            where: { id: license.id },
            data: { razorpayInvoiceId: invoice.id, amountPaise: priceInPaise, currency: "INR" },
        });

        return res.json({
            status: true,
            data: { invoiceUrl: invoice.short_url, invoiceId: invoice.id },
        });
    } catch (err) {
        console.error("Error creating license purchase:", err);
        return res.status(500).json({ status: false, msg: "Unable to create purchase" });
    }
});

// Called by the desktop app to redeem a key. Also used for the periodic
// background re-validation the app does after first activation.
router.post("/activate", async (req, res) => {
    const { key } = req.body || {};
    if (!key) {
        return res.status(400).json({ status: false, msg: "key is required" });
    }

    const license = await prisma.license.findUnique({ where: { key } });
    if (!license || license.status !== "active") {
        return res.status(403).json({ status: false, msg: "Invalid or inactive license key" });
    }

    await prisma.license.update({
        where: { id: license.id },
        data: { lastValidatedAt: new Date() },
    });

    return res.json({ status: true, data: { valid: true, activatedAt: license.activatedAt } });
});


// Returns the logged-in account's license(s) for the "My License" web
// dashboard. Never exposes boundDeviceId directly - just whether it's
// bound (always 0 or 1 device for now).
router.get("/me", requireAuth, async (req, res) => {
    const licenses = await prisma.license.findMany({
        where: { accountId: req.accountId },
        orderBy: { createdAt: "desc" },
    });
    return res.json({
        status: true,
        data: licenses.map((l) => ({
            id: l.id,
            key: l.key,
            status: l.status,
            activatedAt: l.activatedAt,
            boundToDevice: !!l.boundDeviceId,
            boundAt: l.boundAt,
        })),
    });
});

// Called by the desktop app exactly once, the first time it runs on a given
// computer. Verifies email+password, finds the account's active Pro Max
// license, and binds it to this device if it isn't bound yet (rejects a
// second, different device). On success, issues a signed offline
// certificate - not the raw license key, not a session token - that the
// app stores locally and verifies itself forever after using the public
// key baked into the app. No further contact with this server is needed
// after this one call.
router.post("/device-login", async (req, res) => {
    const { email, password, deviceId } = req.body || {};
    if (!email || !password || !deviceId) {
        return res.status(400).json({ status: false, msg: "email, password and deviceId are required" });
    }
    const account = await prisma.account.findUnique({ where: { email } });
    if (!account || !verifyPassword(password, account.passwordHash)) {
        return res.status(401).json({ status: false, msg: "Invalid email or password" });
    }
    const license = await prisma.license.findFirst({
        where: { accountId: account.id, status: "active" },
        orderBy: { activatedAt: "desc" },
    });
    if (!license) {
        return res.status(403).json({ status: false, msg: "No active EcomLens Pro Max license found for this account" });
    }
    if (!license.unlimitedDevices && license.boundDeviceId && license.boundDeviceId !== deviceId) {
        return res.status(403).json({
            status: false,
            msg: "This license is already active on another device. Contact support to transfer it.",
        });
    }
    // unlimitedDevices licenses (admin-only, internal use) skip binding
    // entirely - boundDeviceId/boundAt are left untouched since there's no
    // single "the device" to record once more than one is active at once.
    await prisma.license.update({
        where: { id: license.id },
        data: license.unlimitedDevices
            ? { lastValidatedAt: new Date() }
            : {
                  boundDeviceId: deviceId,
                  boundAt: license.boundAt || new Date(),
                  lastValidatedAt: new Date(),
              },
    });
    const certificate = signDeviceCertificate({
        accountId: account.id,
        licenseId: license.id,
        deviceId,
    });
    return res.json({ status: true, data: { certificate } });
});

module.exports = router;
