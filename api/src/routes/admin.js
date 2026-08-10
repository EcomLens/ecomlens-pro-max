const express = require("express");
const prisma = require("../lib/prisma");
const razorpay = require("../lib/razorpay");
const requireAdmin = require("../middleware/requireAdmin");

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
        })),
    });
});

// Resends the original Razorpay invoice to the original customer email via
// Razorpay's own notify endpoint - doesn't need our own email service.
// Resending to a DIFFERENT email than the original purchase isn't supported
// here yet; that needs its own email-service integration.
router.post("/invoices/:id/resend", async (req, res) => {
    const license = await prisma.license.findUnique({ where: { id: req.params.id } });
    if (!license || !license.razorpayInvoiceId) {
        return res.status(404).json({ status: false, msg: "Invoice not found" });
    }

    try {
        await razorpay.invoices.notifyBy(license.razorpayInvoiceId, "email");
        return res.json({ status: true, msg: "Invoice resent" });
    } catch (err) {
        console.error("Error resending invoice:", err);
        return res.status(500).json({ status: false, msg: "Unable to resend invoice" });
    }
});

module.exports = router;
