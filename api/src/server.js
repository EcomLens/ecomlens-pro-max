require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const licenseRoutes = require("./routes/license");
const webhookRoutes = require("./routes/webhooks");

const app = express();

app.use(cors());

// Mounted BEFORE the global json() parser below, with its own raw-body
// middleware, because Razorpay's webhook signature is computed over the
// exact raw request bytes - re-serialized JSON would not match.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/license", licenseRoutes);

app.get("/health", (req, res) => res.json({ status: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`ecomlens-api listening on port ${port}`);
});
