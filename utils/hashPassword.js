const crypto = require("crypto");

function hashPassword(password, key) {
    const hasher = key ? crypto.createHmac("sha256", key) : crypto.createHash("sha256");
    return hasher.update(password).digest("hex");
}

module.exports = hashPassword;