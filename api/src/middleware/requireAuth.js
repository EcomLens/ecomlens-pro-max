const { verifySessionToken } = require("../lib/jwt");

// Same shape as requireAdmin but without the isAdmin check - for
// customer-facing endpoints (the web app), not the admin dashboard.
module.exports = function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ status: false, msg: "Missing authorization token" });
    }

    try {
        const payload = verifySessionToken(token);
        req.accountId = payload.accountId;
        next();
    } catch (err) {
        return res.status(401).json({ status: false, msg: "Invalid or expired token" });
    }
};
