const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const privateKeyPath = path.join(__dirname, "../../keys/license_signing_private.pem");
const privateKey = fs.readFileSync(privateKeyPath, "utf8");

// Issues a long-lived, offline-verifiable certificate proving one specific
// device is licensed. Signed with our private key (RS256) - the desktop app
// verifies it locally forever after using the matching public key baked
// into the app at build time. No expiresIn on purpose: this is meant to
// keep working offline indefinitely once issued. If a license needs to be
// revoked, that happens server-side (clearing boundDeviceId so a future
// device-login is rejected/rebindable) - the already-issued certificate on
// an old device can't be remotely invalidated, which is a known tradeoff of
// working fully offline.
function signDeviceCertificate({ accountId, licenseId, deviceId }) {
    return jwt.sign(
        { accountId, licenseId, deviceId },
        privateKey,
        { algorithm: "RS256" }
    );
}

module.exports = { signDeviceCertificate };
