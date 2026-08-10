const { verifySessionToken } = require("../lib/jwt");

// Expects "Authorization: Bearer <token>". Rejects anything without a valid,
// non-expired token whose account was an admin at login time. Note this
// means revoking admin access on an account doesn't take effect until that
// account's existing token expires (7 days) - acceptable for an internal
// tool with a small number of admins, but worth knowing if that ever changes.
module.exports = function requireAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ status: false, msg: "Missing authorization token" });
    }

    try {
        const payload = verifySessionToken(token);
        if (!payload.isAdmin) {
            return res.status(403).json({ status: false, msg: "Admin access required" });
        }
        req.accountId = payload.accountId;
        next();
    } catch (err) {
        return res.status(401).json({ status: false, msg: "Invalid or expired token" });
    }
};
