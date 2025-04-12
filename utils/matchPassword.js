
const hashPassword = require("./hashPassword");

function matchPassword(hashedPassword, key, password) {
    return password === hashedPassword || hashPassword(password, key) === hashedPassword;
}

module.exports = matchPassword;