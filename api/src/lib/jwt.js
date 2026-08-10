const jwt = require("jsonwebtoken");

function signSessionToken(account) {
    return jwt.sign(
        { accountId: account.id, isAdmin: !!account.isAdmin },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function verifySessionToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signSessionToken, verifySessionToken };
