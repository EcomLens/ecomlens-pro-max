const express = require("express");
const prisma = require("../lib/prisma");
const razorpay = require("../lib/razorpay");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// Fixed preset packages - server is the source of truth for price. Keep in
// sync with the pricing shown on the website (Rs.1.50/credit, no expiry).
const PACKAGES = {
    starter: { credits: 100, amountPaise: 15000 },
    standard: { credits: 500, amountPaise: 75000 },
    bulk: { credits: 1000, amountPaise: 150000 },
};

// Starts a credit top-up for the logged-in web app user. Creates a "pending"
// CreditPurchase row, then asks Razorpay to generate + host an invoice -
// same pattern as license.js's /purchase. The webhook in webhooks.js is
// what actually credits the account once Razorpay confirms payment;
// nothing here grants credits.
router.post("/purchase", requireAuth, async (req, res) => {
    const { package: packageId } = req.body || {};
    const pkg = PACKAGES[packageId];
    if (!pkg) {
        return res.status(400).json({ status: false, msg: "Invalid package" });
    }

    try {
        const account = await prisma.account.findUnique({ where: { id: req.accountId } });
        if (!account) {
            return res.status(404).json({ status: false, msg: "Account not found" });
        }

        const purchase = await prisma.creditPurchase.create({
            data: {
                accountId: account.id,
                credits: pkg.credits,
                amountPaise: pkg.amountPaise,
                currency: "INR",
                status: "pending",
            },
        });

        const invoice = await razorpay.invoices.create({
            type: "invoice",
            customer: { name: account.name || account.email, email: account.email },
            line_items: [
                {
                    name: "EcomLens Web - " + pkg.credits + " Credits",
                    amount: pkg.amountPaise,
                    currency: "INR",
                    quantity: 1,
                },
            ],
            currency: "INR",
            email_notify: 1,
            sms_notify: 0,
            notes: { creditPurchaseId: purchase.id },
        });

        await prisma.creditPurchase.update({
            where: { id: purchase.id },
            data: { razorpayInvoiceId: invoice.id },
        });

        return res.json({
            status: true,
            data: { invoiceUrl: invoice.short_url, invoiceId: invoice.id },
        });
    } catch (err) {
        console.error("Error creating credit purchase:", err);
        return res.status(500).json({ status: false, msg: "Unable to create purchase" });
    }
});

// Returns the logged-in account's current credit balance and recent
// purchase history, for the web app header/dashboard.
router.get("/me", requireAuth, async (req, res) => {
    const account = await prisma.account.findUnique({ where: { id: req.accountId } });
    const purchases = await prisma.creditPurchase.findMany({
        where: { accountId: req.accountId },
        orderBy: { createdAt: "desc" },
        take: 20,
    });
    return res.json({
        status: true,
        data: {
            creditBalance: account ? account.creditBalance : 0,
            purchases: purchases.map((p) => ({
                id: p.id,
                credits: p.credits,
                amountPaise: p.amountPaise,
                status: p.status,
                createdAt: p.createdAt,
                paidAt: p.paidAt,
            })),
        },
    });
});

module.exports = router;
