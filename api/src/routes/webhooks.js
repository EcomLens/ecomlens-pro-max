const express = require("express");
const Razorpay = require("razorpay");
const prisma = require("../lib/prisma");
const { sendLicenseEmail } = require("../lib/mailer");
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
                include: { account: true },
            });
            if (!license) {
                const creditPurchase = await prisma.creditPurchase.findUnique({
                    where: { razorpayInvoiceId: invoice.id },
                });
                if (!creditPurchase) {
                    console.warn("No matching license or credit purchase for paid invoice:", invoice.id);
                } else if (creditPurchase.status !== "paid") {
                    await prisma.$transaction([
                        prisma.creditPurchase.update({
                            where: { id: creditPurchase.id },
                            data: { status: "paid", paidAt: new Date() },
                        }),
                        prisma.account.update({
                            where: { id: creditPurchase.accountId },
                            data: { creditBalance: { increment: creditPurchase.credits } },
                        }),
                    ]);
                    console.log("Credits added:", creditPurchase.credits, "to account", creditPurchase.accountId);
                }
            } else if (license.status !== "active") {
                await prisma.license.update({
                    where: { id: license.id },
                    data: { status: "active", activatedAt: new Date() },
                });
                console.log("License activated:", license.key);
                try {
                    await sendLicenseEmail({ to: license.account.email, licenseKey: license.key });
                    console.log("License email sent to:", license.account.email);
                } catch (emailErr) {
                    // Activation itself already succeeded above - a failed email
                    // shouldn't be treated as a failed webhook. The customer can
                    // still retrieve their key from the "My License" page once
                    // that's live, or contact support.
                    console.error("Failed to send license email:", emailErr);
                }
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
