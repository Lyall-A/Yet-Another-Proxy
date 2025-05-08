const escapeRegex = require("./escapeRegex");

function matchUrl(pattern, url) {
    // TODO: make better, /hello/* matches /hello/some/thing
    // Match URL, ignores trailing slash and duplicate slashes
    return new RegExp(`^${pattern.split("*").map(escapeRegex).join(".+")}\/?$`).test(url.split("?")[0].replace(/\/+/g, "/"));
}

module.exports = matchUrl;