const escapeRegex = require("./escapeRegex");

function matchUrl(pattern, url) {
    // TODO: make better, very simple rn just for testing
    return new RegExp(`^${pattern.split("*").map(escapeRegex).join(".+")}$`).test(url);
}

module.exports = matchUrl;