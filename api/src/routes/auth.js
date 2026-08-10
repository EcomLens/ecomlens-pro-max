const express = require("express");
const prisma = require("../lib/prisma");
const { hashPassword, verifyPassword } = require("../lib/passwords");

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

    return res.json({ status: true, data: { id: account.id, email: account.email, name: account.name } });
});

module.exports = router;
