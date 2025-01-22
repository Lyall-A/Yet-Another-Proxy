function matchAddress(address, matches) {
    let matched = null;
    for (const match of matches) {
        if (matched) break;
        const [subnet, bits] = match.split("/");
        if (bits) {
            const subnetBinary = subnet.split(".").map(octet => parseInt(octet).toString(2).padStart(8, "0")).join("");
            const addressBinary = address.split(".").map(octet => parseInt(octet).toString(2).padStart(8, "0")).join("");
            const maskedSubnet = subnetBinary.substring(0, parseInt(bits));
            const maskedAddress = addressBinary.substring(0, parseInt(bits));
            if (maskedSubnet === maskedAddress) matched = match;
        } else {
            if (address === match) matched = match;
        }
    };
    return matched;
}

module.exports = matchAddress;