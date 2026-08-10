const express = require("express");
const prisma = require("../lib/prisma");
const razorpay = require("../lib/razorpay");
const { generateLicenseKey } = require("../lib/licenseKey");

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
            data: { razorpayInvoiceId: invoice.id },
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

module.exports = router;
