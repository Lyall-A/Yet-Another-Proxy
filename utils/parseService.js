// Going to be used for parsing older versions of services
function parseService(service) {
    if (!service._version || service._version === 1) {
        // Version 1
        return service;
    } else {
        throw new Error(`Unknown service version: ${json._version}`);
    }
}

module.exports = parseService;