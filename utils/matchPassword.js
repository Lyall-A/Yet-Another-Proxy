
const hashPassword = require("./hashPassword");

function matchPassword(hashedPassword, key, password) {
    if (password === hashedPassword) return 1; // 1: matches hashed password
    if (hashPassword(password, key) === hashedPassword) return 2; // 2: matches after hashing
    return 0; // no match
}

module.exports = matchPassword;