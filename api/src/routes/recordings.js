const express = require("express");
const prisma = require("../lib/prisma");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

// Called by the web app right after a recording finishes saving locally.
// Metadata only - no video file ever reaches this server.
router.post("/", async (req, res) => {
    const { barcode } = req.body || {};
    if (!barcode) {
        return res.status(400).json({ status: false, msg: "barcode is required" });
    }

    const recording = await prisma.recording.create({
        data: { accountId: req.accountId, barcode },
    });

    res.json({ status: true, data: recording });
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
