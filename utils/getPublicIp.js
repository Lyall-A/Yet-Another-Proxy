const http = require("http");
const https = require("https");

function getPublicIp(options = { }) {
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

                if (!dataString) return reject("Response from IP API is empty");

                if (options.json) {
                    try {
                        const dataJson = JSON.parse(dataString);
                        const publicIp = options.json.split(".").reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : undefined, dataJson);
                        if (!publicIp) reject(`Public IP not found in JSON response from IP API: '${dataString}'`);
                        resolve(publicIp);
                    } catch (err) {
                        reject(`Failed to parse response from IP API: '${dataString}'`);
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

module.exports = getPublicIp;