const express = require("express");
const prisma = require("../lib/prisma");
const { hashPassword, verifyPassword } = require("../lib/passwords");
const { signSessionToken } = require("../lib/jwt");

const router = express.Router();

router.post("/signup", async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ status: false, msg: "email and password are required" });
    }

    const existing = await prisma.account.findUnique({ where: { email } });
    if (existing) {
        return res.status(409).json({ status: false, msg: "An account with this email already exists" });
    }

    const account = await prisma.account.create({
        data: { email, name: name || null, passwordHash: hashPassword(password) },
    });

    return res.json({ status: true, data: { id: account.id, email: account.email, name: account.name } });
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ status: false, msg: "email and password are required" });
    }

    const account = await prisma.account.findUnique({ where: { email } });
    if (!account || !verifyPassword(password, account.passwordHash)) {
        return res.status(401).json({ status: false, msg: "Invalid email or password" });
    }

    return res.json({
        status: true,
        data: {
            id: account.id,
            email: account.email,
            name: account.name,
            isAdmin: account.isAdmin,
            token: signSessionToken(account),
        },
    });
});


// Lets a customer set (or reset) their account password using their desktop
// Pro Max license key as proof of purchase. This exists because purchase-first
// signups (see license.js /purchase) create an account with no password set,
// and there's no other password-reset flow in the product yet - the license
// key plays that role. Requires the license to already be "active" (i.e. paid
// and confirmed via the Razorpay webhook) so an unpaid/pending key can't be
// used to claim an account.
router.post("/claim", async (req, res) => {
    const { email, licenseKey, password } = req.body || {};
    if (!email || !licenseKey || !password) {
        return res.status(400).json({ status: false, msg: "email, licenseKey and password are required" });
    }
    if (password.length < 8) {
        return res.status(400).json({ status: false, msg: "Password must be at least 8 characters" });
    }
    const account = await prisma.account.findUnique({ where: { email } });
    const license = await prisma.license.findUnique({ where: { key: licenseKey } });
    const matches = account && license && license.accountId === account.id && license.status === "active";
    if (!matches) {
        return res.status(401).json({ status: false, msg: "Invalid email or license key" });
    }
    await prisma.account.update({
        where: { id: account.id },
        data: { passwordHash: hashPassword(password) },
    });
    return res.json({
        status: true,
        data: {
            id: account.id,
            email: account.email,
            name: account.name,
            token: signSessionToken(account),
        },
    });
});

module.exports = router;
