const fs = require("fs");
const path = require("path");

const Proxy = require("./src/Proxy");

let config;
let authHtml;
const services = [];

loadConfig();
fs.watchFile("./config.json", () => {
    log("INFO", "Config updated");
    loadConfig();
});

loadServices();
fs.watch(config.servicesLocation, () => {
    loadServices();
});

loadAuthorizationPage();
fs.watchFile("./authorization.html", () => {
    log("INFO", "Authorization page updated");
    loadAuthorizationPage();
});

const proxy = new Proxy();

proxy.on("request", (http, connection) => {
    const host = http.getHeader("Host");
    const address = connection.clientConnection.address;
    const realAddress = http.headers.find(([key, value]) => config.realIPHeaders?.includes(key))?.[1];
    const formattedAddress = `${address}${realAddress ? ` (${realAddress})` : ""}`;

    if (http.protocol !== "HTTP/1.1") return;

    for (const service of services) {
        const formattedServiceName = `${host} (${service.name || "Unknown service"})`;

        const formatStringObject = {
            http,
            connection,
            service,
            config,

            host,
            address,
            realAddress
        };

        if (service.hosts.some(i =>
            i === host ||
            (i.startsWith(".") && host.endsWith(i)) ||
            (i.endsWith(".") && host.startsWith(i))
        )) {
            // Whitelist
            if (service.whitelistedAddresses?.length) {
                if (!matchAddress(address, service.whitelistedAddresses)) {
                    log("WARN", `Un-whitelisted address '${formattedAddress}' attempted to connect to '${formattedServiceName}'`);
                    return;
                }
            }

            // Blacklist
            if (service.blacklistedAddresses?.length) {
                if (matchAddress(address, service.blacklistedAddresses)) {
                    log("WARN", `Blacklisted address '${formattedAddress}' attempted to connect to '${formattedServiceName}'`);
                    return;
                }
            }

            // Authentication
            if (service.authentication) {
                let passedAuth = false;
                let authedUsername = null;
                const bypassedAuth = service.authenticationBypassedAddresses?.length ? (matchAddress(address, service.authenticationBypassedAddresses) || (realAddress && matchAddress(realAddress, service.authenticationBypassedAddresses)) ? true : false) : false;

                if (!bypassedAuth) {
                    if (service.authenticationType === "basic") {
                        // Basic authentication
                        const encodedAuthorization = http.getHeader("Authorization")?.match(/Basic (.+)/);
                        if (encodedAuthorization) {
                            const decodedAuthorization = Buffer.from(encodedAuthorization[1], "base64").toString();
                            const [username, password] = decodedAuthorization.split(":");
                            if (service.users?.length) {
                                const user = service.users.find(i => i?.username?.toLowerCase() === username?.toLowerCase());
                                if (user && user.password === password) {
                                    passedAuth = true;
                                    authedUsername = user.username;
                                }
                            } else if (service.password === password) passedAuth = true;
                        }
                        if (!passedAuth) return connection.bypass(401, "Unauthorized", [["WWW-Authenticate", "Basic realm=\"Proxy Authorization\", charset=\"UTF-8\""]]);
                    } else if (service.authenticationType === "cookies") {
                        // Cookie authentication
                        const usernameCookie = http.cookies[service.usernameCookie];
                        const passwordCookie = http.cookies[service.passwordCookie];
                        if (passwordCookie) {
                            const password = decodeURIComponent(passwordCookie);
                            if (service.users?.length) {
                                if (usernameCookie) {
                                    const username = decodeURIComponent(usernameCookie);
                                    const user = service.users.find(i => i?.username?.toLowerCase() === username?.toLowerCase());
                                    console.log(user)
                                    if (user && user.password === password) {
                                        passedAuth = true;
                                        authedUsername = user.username;
                                    }
                                }
                            } else if (service.password === password) passedAuth = true;
                        }
                        if (!passedAuth) return connection.bypass(401, "Unauthorized", [["Content-Type", "text/html"]], formatString(authHtml, formatStringObject));
                    }
                }

                if (!passedAuth && !bypassedAuth) return; else {
                    if (passedAuth) log("LOG", `'${formattedAddress}' authenticated${authedUsername ? ` as '${authedUsername}'` : ""} for '${formattedServiceName}'`);
                    if (bypassedAuth) log("WARN", `'${formattedAddress}' bypassed authentication for '${formattedServiceName}'`);
                }
            }

            if (connection.firstRequest) {
                log("LOG", `'${formattedAddress}' connecting to '${formattedServiceName}'`);
                connection.on("close", () => {
                    log("LOG", `'${formattedAddress}' disconnected from '${formattedServiceName}'`);
                });
                connection.on("client-error", err => {
                    log("ERROR", "Client error:", err);
                });
                connection.on("origin-error", err => {
                    log("ERROR", "Origin error:", err);
                });
                connection.on("client-data", (data, http) => {
                    log("DEBUG", `Client data: ${data.byteLength}`);
                });
                connection.on("origin-data", (data, http) => {
                    log("DEBUG", `Origin data: ${data.byteLength}`);
                });
            }

            // Modify request headers
            if (service.modifiedRequestHeaders) {
                const originalHeaders = http.headers.map(([key, value]) => ([key, value]));
                for (const [key, value] of service.modifiedRequestHeaders) {
                    if (value === null) {
                        // Delete header
                        http.removeHeader(key);
                    } else if (value === true) {
                        // Keep original header
                        const originalHeader = originalHeaders.find(([originalKey, originalValue]) => originalKey === key);
                        if (originalHeader) http.setHeader(key, originalHeader[1]);
                    } else {
                        // Modify header
                        http.setHeader(key, formatString(value, formatStringObject));
                    }
                }
            }

            // Disallow robots
            if (service.disallowRobots && http.target === "/robots.txt") {
                return connection.bypass(200, "OK", [["Content-Type", "text/plain"]], "User-agent: *\nDisallow: /");
            }

            if (service.redirect) {
                // Redirect
                return connection.bypass(302, "Found", [["Location", service.redirect]]);
            }
            else if (service.originHost && service.originPort) {
                // Proxy
                connection.proxy({
                    host: service.originHost,
                    port: service.originPort,
                    ssl: service.ssl
                });
            }

            return;
        }
    }

    log("LOG", `'${formattedAddress}' went to unknown host '${host}'`);
    // return connection.bypass(404, "Not Found", [["Content-Type", "text/html"]], "<h1>Fuck off</h1>");
});

proxy.listen(config.port || 80, config.hostname || "0.0.0.0", () => log("INFO", `Proxy listening at ${proxy.hostname}:${proxy.port}`));

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
            const originalService = JSON.parse(fs.readFileSync(serviceFile, "utf-8"));
            const service = {
                name: originalService.name || path.basename(serviceFile, path.extname(serviceFile)),
                ...(config.defaultServiceOptions || {}),
                ...originalService,

                modifiedRequestHeaders: [
                    ...(config.defaultServiceOptions?.modifiedRequestHeaders || []),
                    ...(originalService.modifiedRequestHeaders || [])
                ]
            };

            // Check if service is valid
            if (service.authentication) {
                if (!service.users?.length && !service.password) throw new Error("Service authentication enabled but no users or password set");
                if (service.authenticationType !== "basic" && service.authenticationType !== "cookies") throw new Error(`Unknown authentication type '${service.authenticationType}'`);
            }
            if (!service.redirect && (!service.originHost || !service.originPort)) throw new Error("Nothing to do");
            
            services.push(service);
            log("INFO", `Loaded service '${service.name || path.basename(serviceFile, path.extname(serviceFile))}'`);
        } catch (err) {
            log("INFO", `Failed to load service '${serviceFile}', ${err}`);
        }

        // (function parseServiceFile(serviceFilePath) {
        //     const serviceFile = fs.readFileSync(serviceFilePath, "utf-8");
        //     const service = Object.fromEntries(Array.from(serviceFile.matchAll(/([a-zA-Z0-9_]+)\s*=\s*(.*)/g)).map(([match, key, value]) => ([ key, value ])));
        //     services.push(service);
        // })(serviceFile)
    }
}

function formatString(string, object = {}) {
    return string.replace(/\\?(?:{{(.+?)}}|%%(.*?)%%)/gs, (match, objectGroup, evalGroup) => {
        if (match.startsWith("\\")) return match.slice(1);

        if (objectGroup) {
            return objectGroup.split(".").reduce((acc, key) => acc && acc[key], object) ?? "";
        }

        if (evalGroup) {
            try {
                return eval(`${Object.entries(object).map(([key, value]) => `const ${key} = ${JSON.stringify(value)};`).join("\n")}\n\n${evalGroup}`);
            } catch (err) {
                return "";
            }
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
    if (!config.logLevels?.includes(level)) return;
    console.log(`[${level}]`, ...msgs);
}
