const formatString = require("./formatString");

function modifyHeaders(modifiedHeaders, http, formatStringObject) {
    const originalHeaders = http.headers.map(([key, value]) => ([key, value]));
    for (const [key, value] of modifiedHeaders) {
        if (value === null) {
            // Delete header
            http.removeHeader(key);
        } else if (value === true) {
            // Keep original header
            const originalHeader = originalHeaders.find(([originalKey, originalValue]) => originalKey === key);
            if (originalHeader) http.setHeader(key, originalHeader[1]);
        } else {
            // Modify header
            http.setHeader(key, formatString(value, formatStringObject));
        }
    }
}

module.exports = modifyHeaders;