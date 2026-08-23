const express = require("express");
const prisma = require("../lib/prisma");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

// Called by the web app right after a recording finishes saving locally.
// Metadata only - no video file ever reaches this server. Gated on credit
// balance - the web app's pay-per-scan model only allows a recording to be
// logged if the account has at least 1 credit.
router.post("/", async (req, res) => {
    const { barcode } = req.body || {};
    if (!barcode) {
        return res.status(400).json({ status: false, msg: "barcode is required" });
    }

    try {
        const recording = await prisma.$transaction(async (tx) => {
            const account = await tx.account.findUnique({ where: { id: req.accountId } });
            if (!account || account.creditBalance <= 0) {
                throw new Error("NO_CREDITS");
            }
            await tx.account.update({
                where: { id: req.accountId },
                data: { creditBalance: { decrement: 1 } },
            });
            return tx.recording.create({ data: { accountId: req.accountId, barcode } });
        });

        res.json({ status: true, data: recording });
    } catch (err) {
        if (err.message === "NO_CREDITS") {
            return res.status(402).json({ status: false, msg: "No credits remaining. Please top up to continue recording." });
        }
        console.error("Error creating recording:", err);
        return res.status(500).json({ status: false, msg: "Unable to save recording" });
    }
});

router.get("/", async (req, res) => {
    const recordings = await prisma.recording.findMany({
        where: { accountId: req.accountId },
        orderBy: { recordedAt: "desc" },
        take: 50,
    });

    res.json({ status: true, data: recordings });
});

module.exports = router;
