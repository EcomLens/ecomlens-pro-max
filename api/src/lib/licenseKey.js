const crypto = require("crypto");

// Excludes visually-confusable characters (0/O, 1/I/L) since these keys are
// meant to be readable/typeable, not just pasted.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateLicenseKey() {
    const groups = [];
    for (let g = 0; g < 4; g++) {
        let group = "";
        for (let i = 0; i < 4; i++) {
            group += ALPHABET[crypto.randomInt(ALPHABET.length)];
        }
        groups.push(group);
    }
    return `PROMAX-${groups.join("-")}`;
}

module.exports = { generateLicenseKey };
