const jwt = require("jsonwebtoken");
const { machineIdSync } = require("node-machine-id");
const { CONSTANTS } = require("../utils/coreUtils/constants.coreutils.js");
const { getActivationStatus, setActivationStatus } = require("../utils/coreUtils/appConfig.coreutils.js");
const { dbAPI } = require("../models/db.js");

// Public key matching the private key the EcomLens API uses to sign device
// certificates (RS256). Safe to embed in the app - this key can only verify
// signatures, it cannot be used to create/forge one.
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7utDd8y3MwJyiuJoFjXL
U7xl068LbhiewTh38eS/v+zvWSsZlFrGG70kQGAtzeYuDNo8r1pajpYrtsWr/9oP
kn1w89BaC9QeMo9QvJvo9aFD2CjWuDnuXEQqABVcPouuI1z6GxkxmS+7yvtHj9P+
uH+VxE+7sgo965zvz6pdl1b1y3qi/rlA5axoSPv4Qk8tNZHHgtmbs5/ktW2cEc23
8kgWJaM0XiTYe6RT+RVkHlbFTRdcy9oul5+Cbgt/S60vrJIjKfAFMpsdruDPBYIu
KlyLJvpJGfaz+fTh4KODx1xM9SOkb1me77InCWyDy5B9KlwLD6wnqgH5pr1bQam5
BwIDAQAB
-----END PUBLIC KEY-----`;

function getDeviceId() {
    return machineIdSync();
}

// Called once, the first time this app is used on this computer. Contacts
// the backend with email+password, gets back a signed offline certificate
// tying this license to this specific device, and stores it locally. After
// this succeeds, the app never needs to contact the server again.
async function deviceLoginIPC(event, email, password) {
    if (!email || !password) {
        return { status: false, msg: "Email and password are required" };
    }
    let deviceId;
    try {
        deviceId = getDeviceId();
    } catch (err) {
        console.error("Unable to read device id:", err);
        return { status: false, msg: "Unable to identify this device" };
    }
    try {
        const response = await fetch(`${CONSTANTS.apiBaseUrl}/api/license/device-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, deviceId }),
        });
        const result = await response.json();
        if (!result.status) {
            return result;
        }
        setActivationStatus({
            activated: true,
            licenseKey: null,
            licenseCertificate: result.data.certificate,
            activatedAt: new Date().toISOString(),
            lastValidatedAt: new Date().toISOString(),
        });
        try {
            await dbAPI.auth.signup(email, password, null);
        } catch (seedErr) {
            console.warn("Local account seed skipped (likely already exists):", seedErr.message);
        }
        return { status: true, msg: "Device activated" };
    } catch (err) {
        console.error("Error during device login:", err);
        return { status: false, msg: "Unable to reach the activation server. Check your internet connection." };
    }
}

// Fully offline check, run on every app launch. Verifies the stored
// certificate's signature against our embedded public key and confirms it
// was issued for this exact device - no network contact, no revalidation.
function getActivationStatusIPC() {
    const status = getActivationStatus();
    if (!status.licenseCertificate) {
        return { activated: false, licenseKey: null, activatedAt: null, lastValidatedAt: null };
    }
    try {
        const payload = jwt.verify(status.licenseCertificate, LICENSE_PUBLIC_KEY, { algorithms: ["RS256"] });
        const currentDeviceId = getDeviceId();
        if (payload.deviceId !== currentDeviceId) {
            console.warn("License certificate was issued for a different device");
            return { activated: false, licenseKey: null, activatedAt: null, lastValidatedAt: null };
        }
        return {
            activated: true,
            licenseKey: null,
            activatedAt: status.activatedAt,
            lastValidatedAt: status.lastValidatedAt,
        };
    } catch (err) {
        console.warn("Stored license certificate failed verification:", err.message);
        return { activated: false, licenseKey: null, activatedAt: null, lastValidatedAt: null };
    }
}

exports.deviceLoginIPC = deviceLoginIPC;
exports.getActivationStatusIPC = getActivationStatusIPC;
