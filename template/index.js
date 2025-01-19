const fs = require("fs");
const path = require("path");

const Proxy = require("../src/Proxy");

const proxy = new Proxy();

let config;
let authHtml;
const services = [];

loadConfig();
fs.watchFile("./config.json", () => {
    loadConfig();
});

loadServices();
fs.watch(config.servicesLocation, () => {
    loadServices();
});

loadAuthorizationPage();
fs.watchFile("./authorization.html", () => {
    loadAuthorizationPage();
});

proxy.on("request", (http, connection) => {
    for (const service of services) {
        const host = http.getHeader("host");
        const address = connection.clientConnection.address;
        const serviceName = service.name || service.host;

        if (service["hosts"].some(i =>
            i === host ||
            (i.startsWith(".") && host.endsWith(i)) ||
            (i.endsWith(".") && host.startsWith(i))
        )) {
            if (service["whitelist"]?.length) {
                if (!matchAddress(address, service["whitelist"])) {
                    log(1, `Un-whitelisted address '${address}' attempted to connect to '${serviceName}'`);
                    return;
                }
            }
            
            if (service["blacklist"]?.length) {
                if (matchAddress(address, service["blacklist"])) {
                    log(1, `Blacklisted address '${address}' attempted to connect to '${serviceName}'`);
                    return;
                }
            }

            if (service["authentication"]) {
                let passedAuth = true;
                const expectedUsername = service["username"];
                const expectedPassword = service["password"];
                if (!expectedPassword) {
                    log(1, `Service '${serviceName}' has authentication enabled but no password set`);
                    return;
                }
                
                if (service["authenticationType"].toLowerCase() === "basic") { 
                    // Basic authentication
                    const encodedAuthorization = http.getHeader("Authorization")?.match(/Basic (.+)/);
                    if (encodedAuthorization) {
                        const decodedAuthorization = Buffer.from(encodedAuthorization[1], "base64").toString();
                        const [username, password] = decodedAuthorization.split(":");
                        if (expectedUsername && expectedUsername !== username) passedAuth = false;
                        if (expectedPassword !== password) passedAuth = false;
                    }
                    if (!passedAuth) return connection.bypass(401, "Unauthorized", [["WWW-Authenticate", "Basic realm=\"Proxy Authorization\", charset=\"UTF-8\""]]);
                } else if (service["authenticationType"].toLowerCase() === "cookies") {
                    // Cookie authentication
                    const username = http.cookies[service.usernameCookie];
                    const password = http.cookies[service.passwordCookie];
                    if (expectedUsername && expectedUsername !== username) passedAuth = false;
                    if (expectedPassword !== password) passedAuth = false;
                    if (!passedAuth) return connection.bypass(401, "Unauthorized", [["Content-Type", "text/html"]], formatString(authHtml, {
                        http,
                        connection,
                        service,
                        config,
                    }));
                } else {
                    log(1, `Service '${serviceName}' has unknown authentication type '${service.authenticationType}'`);
                    return;
                }
            }
            
            log(2, `${address} connecting to ${serviceName}`);
            
            connection.proxy({
                host: service["originHost"],
                port: service["originPort"]
            });
            
            connection.on("client-data", (data, http) => log(3, `Data from client (Length: ${data.byteLength})`));
            connection.on("origin-data", (data, http) => log(3, `Data from origin (Length: ${data.byteLength})`));
            return;
        }
    }

    return connection.bypass(404, "Not Found", [["Content-Type", "text/html"]], "<h1>Fuck off</h1>");
});

proxy.listen(config.port || 80, config.hostname || "0.0.0.0", () => log(0, `Proxy listening at ${proxy.hostname}:${proxy.port}`));

function loadConfig() {
    config = JSON.parse(fs.readFileSync("./config.json", "utf-8"))
}

function loadAuthorizationPage() {
    authHtml = fs.readFileSync(config.authorizationPageLocation, "utf-8");
}

function loadServices() {
    services.splice(0, services.length);
    const serviceFiles = (function getServiceFiles(dirPath) {
        const serviceFiles = [];
        const dir = fs.readdirSync(dirPath);
        for (const filePath of dir) {
            const fullPath = path.resolve(dirPath, filePath);
            if (fs.lstatSync(fullPath).isDirectory()) {
                serviceFiles.push(...getServiceFiles(fullPath));
            } else {
                // if (path.extname(filePath) !== ".service") continue;
                if (path.extname(filePath) !== ".json") continue;
                serviceFiles.push(fullPath);
            }
        }
        return serviceFiles;
    })(config.servicesLocation);

    for (const serviceFile of serviceFiles) {
        try {
            const service = JSON.parse(fs.readFileSync(serviceFile, "utf-8"));
            services.push({
                name: service.name || path.basename(serviceFile, path.extname(serviceFile)),
                ...(config.defaultServiceOptions || { }),
                ...service
            });
            log(0, `Loaded service '${service.name || path.basename(serviceFile, path.extname(serviceFile))}'`);
        } catch (err) {
            log(0, `Failed to load service '${serviceFile}', ${err}`);
        }
        
        // (function parseServiceFile(serviceFilePath) {
        //     const serviceFile = fs.readFileSync(serviceFilePath, "utf-8");
        //     const service = Object.fromEntries(Array.from(serviceFile.matchAll(/([a-zA-Z0-9_]+)\s*=\s*(.*)/g)).map(([match, key, value]) => ([ key, value ])));
        //     services.push(service);
        // })(serviceFile)
    }
}

function formatString(string, object = {}) {
    return string.replace(/\\?{{(.+?)}}/gs, (match, objectGroup) => {
        if (match.startsWith("\\")) return match.slice(1);

        if (objectGroup) {
            return objectGroup.split(".").reduce((acc, key) => acc && acc[key], object) ?? "";
        }

        return match;
    });
}

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

function log(level, ...msgs) {
    if (config.logLevel < level) return;
    console.log(`[${config.logLevels[level]}]`, ...msgs);
}