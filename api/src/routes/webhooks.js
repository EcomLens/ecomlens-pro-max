const express = require("express");
const Razorpay = require("razorpay");
const prisma = require("../lib/prisma");

const router = express.Router();

// req.body is the raw Buffer here (see server.js - this route is mounted
// with express.raw() before the global express.json() middleware, since
// signature verification needs the exact raw bytes, not re-serialized JSON).
router.post("/razorpay", async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body.toString("utf8");

    const isValid = Razorpay.validateWebhookSignature(
        rawBody,
        signature,
        process.env.RAZORPAY_WEBHOOK_SECRET
    );
    if (!isValid) {
        console.warn("Rejected webhook with invalid signature");
        return res.status(400).json({ status: false, msg: "Invalid signature" });
    }

    const event = JSON.parse(rawBody);
    console.log("Razorpay webhook received:", event.event);

    try {
        if (event.event === "invoice.paid") {
            const invoice = event.payload.invoice.entity;
            const license = await prisma.license.findUnique({
                where: { razorpayInvoiceId: invoice.id },
            });

            if (!license) {
                console.warn("No matching license for paid invoice:", invoice.id);
            } else if (license.status !== "active") {
                await prisma.license.update({
                    where: { id: license.id },
                    data: { status: "active", activatedAt: new Date() },
                });
                console.log("License activated:", license.key);
                // TODO: once an email provider is wired up, send the license
                // key to the customer here - Razorpay's invoice email is just
                // the payment receipt, not the product key.
            }
        }
    } catch (err) {
        console.error("Error processing Razorpay webhook:", err);
        // Still 200 - Razorpay retries on non-2xx, and the error above is on
        // our side, not something a retry with the same payload would fix.
    }

    return res.json({ status: true });
});

module.exports = router;
