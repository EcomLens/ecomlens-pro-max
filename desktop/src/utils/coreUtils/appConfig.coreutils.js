const fs = require('fs');
const path = require('path');
const { CONSTANTS } = require('./constants.coreutils.js');
const { validateDir } = require('./validateDir.coreutils.js');

const configFile = path.join(CONSTANTS.configDir, 'config.json');

function readConfig() {
    try {
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        }
    } catch (err) {
        console.error('Failed to read app config:', err);
    }
    return {};
}

function writeConfig(partial) {
    validateDir(CONSTANTS.configDir);
    const updated = { ...readConfig(), ...partial };
    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2));
    return updated;
}

function getVideoDir() {
    const config = readConfig();
    return config.customVideoDir || CONSTANTS.videoDir;
}

function setVideoDir(dir) {
    writeConfig({ customVideoDir: dir });
}

function resetVideoDir() {
    const config = readConfig();
    delete config.customVideoDir;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

function getActivationStatus() {
    const config = readConfig();
    return {
        activated: !!config.activated,
        licenseKey: config.licenseKey || null,
        activatedAt: config.activatedAt || null,
        lastValidatedAt: config.lastValidatedAt || null,
    };
}

function setActivationStatus(partial) {
    writeConfig(partial);
}

module.exports = { getVideoDir, setVideoDir, resetVideoDir, getActivationStatus, setActivationStatus };
