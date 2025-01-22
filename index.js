const fs = require("fs");
const path = require("path");

const formatString = require("./utils/formatString");
const matchAddress = require("./utils/matchAddress");

const Proxy = require("./src/Proxy");

let config;
let authHtml;
const services = [];

// Load and watch config
loadConfig();
fs.watch("./config.json", () => {
    log("INFO", "Reloading config");
    try {
        loadConfig();
    } catch (err) {
        log("ERROR", "Failed to reload config,", err);
    }
});

// Load and watch services
loadServices();
fs.watch(config.servicesLocation, { recursive: true }, (event, filename) => {
    if (path.extname(filename) !== ".json") return; // File is not a service
    if (filename.startsWith("_")) return; // File starts with "_", disable

    const servicePath = path.resolve(config.servicesLocation, filename);

    if (event === "change") {
        // "change" can mean the service was modified
        log("INFO", `Reloading service file '${filename}'`);
        try { loadService(servicePath); } catch (err) {
            log("ERROR", `Failed to reload service file '${filename}',`, err);
        }
    } else if (event === "rename") {
        // "rename" can mean the service was deleted or created
        const serviceIndex = services.findIndex(i => i._path === servicePath);
        if (serviceIndex >= 0) {
            // Service was deleted
            log("INFO", `Removing service file '${filename}'`);
            services.splice(serviceIndex, 1);
        } else {
            // Service was created
            log("INFO", `Loading service file '${filename}'`);
            try { loadService(servicePath); } catch (err) {
                log("ERROR", `Failed to load service file '${filename}',`, err);
            }
        }
    }
});

// Load and watch authorization page
loadAuthorizationPage();
fs.watch("./authorization.html", () => {
    log("INFO", "Reloading authorization page");
    try {
        loadAuthorizationPage();
    } catch (err) {
        log("ERROR", "Failed to reload authorization page,", err);
    }
});

// Create proxy
const proxy = new Proxy();

// New proxy request (received data with HTTP header)
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

            // Is first HTTP request on connection
            if (connection.firstRequest) {
                log("LOG", `'${formattedAddress}' connecting to '${formattedServiceName}'`);
                connection.on("close", () => {
                    log("LOG", `'${formattedAddress}' disconnected from '${formattedServiceName}'`);
                });
                connection.on("client-error", err => {
                    log("ERROR", "Client error,", err);
                });
                connection.on("origin-error", err => {
                    log("ERROR", "Origin error,", err);
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
                return connection.bypass(302, "Found", [["Location", formatString(service.redirect, formatStringObject)]]);
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
    const serviceFiles = (function getServiceFiles(dirPath) {
        const serviceFiles = [];
        const dir = fs.readdirSync(dirPath);
        for (const filePath of dir) {
            const fullPath = path.resolve(dirPath, filePath);
            if (fs.lstatSync(fullPath).isDirectory()) {
                serviceFiles.push(...getServiceFiles(fullPath));
            } else {
                if (path.extname(filePath) !== ".json") continue; // File is not a service
                if (filePath.startsWith("_")) continue; // File starts with "_", disable
                serviceFiles.push(fullPath);
            }
        }
        return serviceFiles;
    })(config.servicesLocation);

    for (const serviceFile of serviceFiles) {
        try {
            loadService(serviceFile);
        } catch (err) {
            log("INFO", `Failed to load service file '${serviceFile}', ${err}`);
        }
    }

    log("INFO", `Loaded ${services.length} service${services.length > 1 ? "s" : ""}`);
}

function loadService(serviceFile) {
    const oldServiceIndex = services.findIndex(i => i._path === serviceFile);
    if (oldServiceIndex >= 0) services.splice(oldServiceIndex, 1);

    // Parse service
    const originalService = JSON.parse(fs.readFileSync(serviceFile, "utf-8"));

    // Create service object
    const service = {
        _path: serviceFile,
        
        name: originalService.name || path.basename(serviceFile, path.extname(serviceFile)),

        ...(config.defaultServiceOptions || { }),
        ...originalService
    };
    if (service.modifiedRequestHeaders) service.modifiedRequestHeaders = [
        ...(config.defaultServiceOptions?.modifiedRequestHeaders || []),
        ...(originalService.modifiedRequestHeaders || [])
    ];

    // Check if service is valid
    if (service.authentication) {
        if (!service.users?.length && !service.password) throw new Error("Service authentication enabled but no users or password set");
        if (service.authenticationType !== "basic" && service.authenticationType !== "cookies") throw new Error(`Unknown authentication type '${service.authenticationType}'`);
    }
    if (service.originPort && (service.originPort < 0 || service.originPort > 65535)) throw new Error("Invalid origin port");
    if (!service.redirect && (!service.originHost || !service.originPort)) throw new Error("Nothing to do");

    services.push(service);
    // log("INFO", `Loaded service '${service.name || path.basename(serviceFile, path.extname(serviceFile))}'`);
}

function log(level, ...msgs) {
    if (!config.logLevels?.includes(level)) return;
    console.log(`[${level}]`, ...msgs);
}
