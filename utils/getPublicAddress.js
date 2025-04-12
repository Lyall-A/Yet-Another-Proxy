const http = require("http");
const https = require("https");

function getPublicAddress(options = { }) {
    return new Promise((resolve, reject) => {
        const req = (options.ssl ? https : http).request({
            host: options.host,
            port: options.port,
            method: options.method,
            path: options.path,
            headers: options.headers,
        }, res => {
            const dataArray = [];
            res.on("data", data => dataArray.push(data));
            res.on("end", () => {
                const dataBuffer = Buffer.concat(dataArray);
                const dataString = dataBuffer.toString();

                if (!dataString) return reject("Response is empty");

                if (options.json) {
                    try {
                        const dataJson = JSON.parse(dataString);
                        const publicAddress = options.json.split(".").reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : undefined, dataJson);
                        if (!publicAddress) reject(`Public address not found in JSON response: '${dataString}'`);
                        resolve(publicAddress);
                    } catch (err) {
                        reject(`Failed to parse response: '${dataString}'`);
                    }
                } else resolve(dataString);
            });
            res.on("error", err => {
                reject(err);
            });
        });

        req.on("error", err => {
            reject(err);
        });
    
        req.end();
    });
}

module.exports = getPublicAddress;