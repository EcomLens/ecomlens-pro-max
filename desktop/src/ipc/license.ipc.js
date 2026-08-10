const { CONSTANTS } = require("../utils/coreUtils/constants.coreutils.js");
const { getActivationStatus, setActivationStatus } = require("../utils/coreUtils/appConfig.coreutils.js");

async function callActivateEndpoint(key) {
    const response = await fetch(`${CONSTANTS.apiBaseUrl}/api/license/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
    });
    return response.json();
}

const activateLicenseIPC = async (event, key) => {
    if (!key) {
        return { status: false, msg: "License key is required" };
    }

    try {
        const result = await callActivateEndpoint(key);
        if (result.status) {
            setActivationStatus({
                activated: true,
                licenseKey: key,
                activatedAt: new Date().toISOString(),
                lastValidatedAt: new Date().toISOString(),
            });
        }
        return result;
    } catch (err) {
        console.error("Error activating license:", err);
        return { status: false, msg: "Unable to reach the activation server. Check your internet connection." };
    }
};

const getActivationStatusIPC = () => getActivationStatus();

// Called on app startup - re-checks a license that's already active, but only
// if it hasn't been checked recently, and only if the server is reachable.
// Network failures are treated as "skip this cycle," not "revoke access" -
// the whole point of activate-once is that the app stays usable offline
// afterward. Only an explicit rejection from the server revokes locally.
async function revalidateLicenseIfStale() {
    const status = getActivationStatus();
    if (!status.activated || !status.licenseKey) return;

    const lastCheck = new Date(status.lastValidatedAt || status.activatedAt).getTime();
    const daysSinceCheck = (Date.now() - lastCheck) / (1000 * 60 * 60 * 24);
    if (daysSinceCheck < 7) return;

    try {
        const result = await callActivateEndpoint(status.licenseKey);
        if (result.status) {
            setActivationStatus({ lastValidatedAt: new Date().toISOString() });
        } else {
            console.warn("License revalidation rejected by server - revoking local activation");
            setActivationStatus({ activated: false });
        }
    } catch (err) {
        console.warn("License revalidation skipped (server unreachable):", err.message);
    }
}

exports.activateLicenseIPC = activateLicenseIPC;
exports.getActivationStatusIPC = getActivationStatusIPC;
exports.revalidateLicenseIfStale = revalidateLicenseIfStale;
