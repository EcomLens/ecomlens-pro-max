const express = require("express");
const prisma = require("../lib/prisma");
const razorpay = require("../lib/razorpay");
const requireAdmin = require("../middleware/requireAdmin");
const { sendLicenseEmail, sendCreditPurchaseEmail } = require("../lib/mailer");

const router = express.Router();
router.use(requireAdmin);

// "Downloads" isn't separately tracked yet (that would need its own counter
// on the installer download link) - totalLicensesIssued is used as the
// closest available proxy: every purchase attempt creates a License row,
// paid or not.
router.get("/summary", async (req, res) => {
    const [totalLicensesIssued, activeLicenses, totalCustomers] = await Promise.all([
        prisma.license.count(),
        prisma.license.findMany({ where: { status: "active" }, select: { amountPaise: true, accountId: true } }),
        prisma.account.count(),
    ]);

    const totalRevenuePaise = activeLicenses.reduce((sum, l) => sum + (l.amountPaise || 0), 0);
    const payingCustomers = new Set(activeLicenses.map(l => l.accountId)).size;

    res.json({
        status: true,
        data: {
            totalLicensesIssued,
            totalActiveLicenses: activeLicenses.length,
            totalRevenuePaise,
            totalCustomers,
            payingCustomers,
        },
    });
});

router.get("/revenue/by-customer", async (req, res) => {
    const licenses = await prisma.license.findMany({
        where: { status: "active" },
        include: { account: { select: { id: true, email: true, name: true } } },
    });

    const byCustomer = new Map();
    for (const l of licenses) {
        const key = l.account.id;
        if (!byCustomer.has(key)) {
            byCustomer.set(key, { email: l.account.email, name: l.account.name, revenuePaise: 0, licenseCount: 0 });
        }
        const entry = byCustomer.get(key);
        entry.revenuePaise += l.amountPaise || 0;
        entry.licenseCount += 1;
    }

    res.json({ status: true, data: Array.from(byCustomer.values()).sort((a, b) => b.revenuePaise - a.revenuePaise) });
});

router.get("/revenue/by-day", async (req, res) => {
    const licenses = await prisma.license.findMany({
        where: { status: "active" },
        select: { amountPaise: true, activatedAt: true },
    });

    const byDay = new Map();
    for (const l of licenses) {
        if (!l.activatedAt) continue;
        const day = l.activatedAt.toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) || 0) + (l.amountPaise || 0));
    }

    const rows = Array.from(byDay.entries())
        .map(([day, revenuePaise]) => ({ day, revenuePaise }))
        .sort((a, b) => b.day.localeCompare(a.day));

    res.json({ status: true, data: rows });
});

router.get("/invoices", async (req, res) => {
    const licenses = await prisma.license.findMany({
        include: { account: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
    });

    res.json({
        status: true,
        data: licenses.map(l => ({
            id: l.id,
            customerEmail: l.account.email,
            customerName: l.account.name,
            status: l.status,
            amountPaise: l.amountPaise,
            currency: l.currency,
            razorpayInvoiceId: l.razorpayInvoiceId,
            createdAt: l.createdAt,
            activatedAt: l.activatedAt,
            boundDeviceId: l.boundDeviceId,
            boundAt: l.boundAt,
            refundedAt: l.refundedAt,
            refundReason: l.refundReason,
        })),
    });
});

// Resends the original Razorpay invoice to the original customer email via
// Razorpay's own notify endpoint - doesn't need our own email service.
// Resending to a DIFFERENT email than the original purchase isn't supported
// here yet; that needs its own email-service integration.
router.post("/invoices/:id/resend", async (req, res) => {
    const license = await prisma.license.findUnique({
        where: { id: req.params.id },
        include: { account: { select: { email: true } } },
    });
    if (!license || !license.razorpayInvoiceId) {
        return res.status(404).json({ status: false, msg: "Invoice not found" });
    }
    try {
        if (license.status === "active") {
            // Razorpay blocks re-notifying an invoice that's already paid
            // ("Operation not allowed for Invoice in paid status") - for an
            // active license, resend our own license-key email instead (the
            // same one the webhook sends on first activation).
            await sendLicenseEmail({ to: license.account.email, licenseKey: license.key });
        } else {
            await razorpay.invoices.notifyBy(license.razorpayInvoiceId, "email");
        }
        return res.json({ status: true, msg: "Invoice resent" });
    } catch (err) {
        console.error("Error resending invoice:", err);
        return res.status(500).json({ status: false, msg: "Unable to resend invoice" });
    }
});

// Marks a license refunded for record-keeping only. Does NOT call Razorpay's
// refund API and does NOT move any money - actually refunding the payment is
// still a separate manual step in the Razorpay dashboard. This just gives
// the admin panel a place to record that it happened and why, since there
// was previously no way to track refunds/cancellations at all.
router.post("/licenses/:id/refund", async (req, res) => {
    const { reason } = req.body || {};
    const license = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!license) {
        return res.status(404).json({ status: false, msg: "License not found" });
    }
    const updated = await prisma.license.update({
        where: { id: license.id },
        data: { status: "refunded", refundedAt: new Date(), refundReason: reason || null },
    });
    return res.json({ status: true, data: updated });
});
// Clears a license's device binding so the customer can activate it on a
// different computer. There was previously no way to do this at all short
// of a direct database edit - needed for the legitimate case of a customer
// switching machines (old PC died, upgraded, etc.), not just for abuse.
// Doesn't touch license status/refund fields, and doesn't itself notify the
// customer - they just need to log in again on the new device afterward.
router.post("/licenses/:id/unbind-device", async (req, res) => {
    const license = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!license) {
        return res.status(404).json({ status: false, msg: "License not found" });
    }
    if (!license.boundDeviceId) {
        return res.status(400).json({ status: false, msg: "This license isn't bound to a device" });
    }
    const updated = await prisma.license.update({
        where: { id: license.id },
        data: { boundDeviceId: null, boundAt: null },
    });
    return res.json({ status: true, data: updated });
});
// Combined per-customer view across both revenue lines (desktop license +
// web credits) - the single-pane view the separate /revenue/by-customer and
// credits endpoints don't give on their own.
router.get("/customers", async (req, res) => {
    const accounts = await prisma.account.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            licenses: { select: { status: true } },
            creditPurchases: { select: { credits: true, amountPaise: true, status: true, source: true } },
        },
    });
    const data = accounts.map(a => {
        const activeLicense = a.licenses.find(l => l.status === "active");
        const licenseStatus = activeLicense ? "active" : (a.licenses[0] ? a.licenses[0].status : "none");
        const paidCredits = a.creditPurchases.filter(c => c.status === "paid");
        const totalCreditsAcquired = paidCredits.reduce((sum, c) => sum + c.credits, 0);
        const totalCreditRevenuePaise = paidCredits
            .filter(c => c.source !== "admin_grant")
            .reduce((sum, c) => sum + (c.amountPaise || 0), 0);
        return {
            id: a.id,
            email: a.email,
            name: a.name,
            isAdmin: a.isAdmin,
            createdAt: a.createdAt,
            licenseStatus,
            licenseCount: a.licenses.length,
            creditBalance: a.creditBalance,
            totalCreditsAcquired,
            totalCreditRevenuePaise,
        };
    });
    res.json({ status: true, data });
});
// Grants or revokes admin dashboard access for an account. Previously the
// only way to do this at all was a direct database update run by hand on
// the VPS (see ops notes) - this is the first real UI for it. Blocks an
// admin from revoking their OWN access via this route, specifically to
// avoid a single-admin business accidentally locking itself out of the
// dashboard with no other way back in; a second admin can still remove the
// first admin's access if there's ever a real reason to.
router.post("/accounts/:id/toggle-admin", async (req, res) => {
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!account) {
        return res.status(404).json({ status: false, msg: "Account not found" });
    }
    if (account.id === req.accountId && account.isAdmin) {
        return res.status(400).json({ status: false, msg: "You can't remove your own admin access" });
    }
    const updated = await prisma.account.update({
        where: { id: account.id },
        data: { isAdmin: !account.isAdmin },
    });
    return res.json({ status: true, data: { id: updated.id, isAdmin: updated.isAdmin } });
});
// Credit KPIs, mirroring the desktop /summary shape. admin_grant rows are
// excluded from revenue so free credits never inflate reported income.
router.get("/credits/summary", async (req, res) => {
    const paid = await prisma.creditPurchase.findMany({ where: { status: "paid" } });
    const purchased = paid.filter(c => c.source !== "admin_grant");
    const granted = paid.filter(c => c.source === "admin_grant");
    const totalCreditsSold = purchased.reduce((sum, c) => sum + c.credits, 0);
    const totalCreditRevenuePaise = purchased.reduce((sum, c) => sum + (c.amountPaise || 0), 0);
    const totalFreeCreditsGranted = granted.reduce((sum, c) => sum + c.credits, 0);
    const accountsWithCredits = await prisma.account.count({ where: { creditBalance: { gt: 0 } } });
    res.json({
        status: true,
        data: {
            totalCreditsSold,
            totalCreditRevenuePaise,
            totalFreeCreditsGranted,
            accountsWithCredits,
        },
    });
});
router.get("/credits/purchases", async (req, res) => {
    const purchases = await prisma.creditPurchase.findMany({
        include: { account: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
    });
    res.json({
        status: true,
        data: purchases.map(p => ({
            id: p.id,
            customerEmail: p.account.email,
            customerName: p.account.name,
            credits: p.credits,
            amountPaise: p.amountPaise,
            currency: p.currency,
            status: p.status,
            source: p.source,
            note: p.note,
            razorpayInvoiceId: p.razorpayInvoiceId,
            createdAt: p.createdAt,
            paidAt: p.paidAt,
        })),
    });
});
router.post("/credits/purchases/:id/resend", async (req, res) => {
    const purchase = await prisma.creditPurchase.findUnique({
        where: { id: req.params.id },
        include: { account: { select: { email: true } } },
    });
    if (!purchase || !purchase.razorpayInvoiceId) {
        return res.status(404).json({ status: false, msg: "Invoice not found" });
    }
    try {
        if (purchase.status === "paid") {
            // Same Razorpay restriction as the license resend above - a paid
            // invoice can't be re-notified, so send our own purchase receipt
            // email instead.
            await sendCreditPurchaseEmail({
                to: purchase.account.email,
                credits: purchase.credits,
                amountPaise: purchase.amountPaise,
                currency: purchase.currency,
            });
        } else {
            await razorpay.invoices.notifyBy(purchase.razorpayInvoiceId, "email");
        }
        return res.json({ status: true, msg: "Invoice resent" });
    } catch (err) {
        console.error("Error resending credit invoice:", err);
        return res.status(500).json({ status: false, msg: "Unable to resend invoice" });
    }
});
// Gives an account free credits without a Razorpay charge. Recorded as its
// own CreditPurchase row (amountPaise: 0, source: "admin_grant") so it shows
// up in the same ledger as real purchases but is excluded from revenue
// totals (see /credits/summary and /customers above) and is always
// auditable - when it happened and why (note).
router.post("/credits/grant", async (req, res) => {
    const { email, credits, note } = req.body || {};
    const creditsInt = parseInt(credits, 10);
    if (!email || !Number.isInteger(creditsInt) || creditsInt <= 0) {
        return res.status(400).json({ status: false, msg: "A valid email and a positive integer credits amount are required" });
    }
    const account = await prisma.account.findUnique({ where: { email } });
    if (!account) {
        return res.status(404).json({ status: false, msg: "No account with that email" });
    }
    const [grant, updatedAccount] = await prisma.$transaction([
        prisma.creditPurchase.create({
            data: {
                accountId: account.id,
                credits: creditsInt,
                amountPaise: 0,
                currency: "INR",
                status: "paid",
                paidAt: new Date(),
                source: "admin_grant",
                note: note || null,
            },
        }),
        prisma.account.update({
            where: { id: account.id },
            data: { creditBalance: { increment: creditsInt } },
        }),
    ]);
    return res.json({ status: true, data: { grantId: grant.id, creditBalance: updatedAccount.creditBalance } });
});
module.exports = router;
