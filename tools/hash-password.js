const crypto = require("crypto");

const hashPassword = require("../utils/hashPassword");

const password = process.argv[2];
const key = process.argv[3];

const hashedPassword = hashPassword(password, key);

console.log(`Hashed password: ${hashedPassword}`);