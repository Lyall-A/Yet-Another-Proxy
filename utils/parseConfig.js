// Going to be used for parsing older versions of config
function parseConfig(config) {
    if (!config._version || config._version === 1) {
        // Version 1
        return config;
    } else {
        throw new Error(`Unknown config version: ${config._version}`);
    }
}

module.exports = parseConfig;