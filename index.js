const fs = require("fs");
const path = require("path");

const formatString = require("./utils/formatString");
const matchAddress = require("./utils/matchAddress");
const matchUrl = require("./utils/matchUrl");
const matchPassword = require("./utils/matchPassword");
const matchHost = require("./utils/matchHost");
const DirectoryMonitor = require("./utils/DirectoryMonitor");
const parseService = require("./utils/parseService");
const parseConfig = require("./utils/parseConfig");
const parseArgs = require("./utils/parseArgs");
const getPublicAddress = require("./utils/getPublicAddress");
const modifyHeaders = require("./utils/modifyHeaders");
const Proxy = require("./src/Proxy");

const argOptions = [
    { long: "help", short: "h", description: "This help menu" },
    { long: "config", description: "Use a different config file", default: "./config.json" },
    { long: "services", description: "Use a different services directory" },
    { long: "pages", description: "Use a different pages directory" },
    { long: "hostname", description: "Listen on hostname", default: "0.0.0.0" },
    { long: "port", description: "Listen on port", type: "int" },
    { long: "debug", description: "Enable debug mode (currently only adds extra information to response headers)" },
    { long: "secure", description: "Enable SSL", type: "bool" },
    { long: "cert", description: "Certificate file" },
    { long: "key", description: "Private key file" },
];
const args = parseArgs(process.argv.slice(2), argOptions);

if (args.help.present) return console.log(`Usage: ${process.argv0} . [OPTION]...\n\n  ${argOptions.map(i => `${[i.long ? `--${i.long}` : null, i.short ? `-${i.short}` : null].filter(i => i).join(", ").padEnd(25, " ")}${i.description || "???"}${i.default ? `, default: ${i.default}` : ""}`).join("\n  ")}`);

// Load and watch config
let config = parseConfig(JSON.parse(fs.readFileSync(args.config.value, "utf-8")));
fs.watch(args.config.value, () => {
    log("INFO", "Reloading config (you might have to restart to apply certain configs)");
    try { config = parseConfig(JSON.parse(fs.readFileSync(args.config.value, "utf-8"))); } catch (err) { log("ERROR", `Failed to reload config, ${err}`); }
});
// Load and watch services
const services = initServices();
// Load and watch pages
const pages = initPages();

let publicAddress = config.publicAddress || null;

if (config.retrievePublicAddress) {
    (async function updatePublicAddress() {
        await getPublicAddress(config.publicAddressApi).then(newPublicAddress => {
            if (publicAddress !== newPublicAddress) {
                publicAddress = newPublicAddress;
                log("INFO", `Public address changed to '${publicAddress}'`);
            }
        }).catch(err => {
            log("ERROR", `Failed to get public address: ${err}`);
        });

        if (config.retrievePublicAddressInterval) setTimeout(updatePublicAddress, config.retrievePublicAddressInterval * 1000);
    })();
}

// Create proxy
const proxy = new Proxy({
    ssl: args.secure.present ? (args.secure.value === false ? false : true) : config.ssl,
    certFile: args.cert.value || config.cert,
    keyFile: args.key.value || config.key
});

// New proxy request (received data with HTTP header)
proxy.on("request", (http, connection) => {
    const host = http.getHeader("Host");
    const hostname = host?.split(":")[0];
    const address = connection.clientConnection.remoteAddress;
    const realAddress = http.headers.find(([key, value]) => config.realIPHeaders?.includes(key))?.[1];
    const formattedAddress = `${address}${realAddress ? ` (${realAddress})` : ""}`;

    const formatStringObject = {
        http,
        connection,
        config,
        hostname,
        address,
        realAddress
    };

    // Check if we should handle this
    if (http.protocol !== "HTTP/1.1") return;
    if (!hostname) return;

    function assignService(service) {
        const formattedServiceName = `${hostname} (${service.name || "Unknown service"})`;
        const serviceHost = matchHost(service.hosts, hostname);

        formatStringObject.service = service;
        formatStringObject.serviceHost = serviceHost;

        // Whitelist
        if (service.whitelistedAddresses?.length) {
            if (
                !(service.publicAddressBypassWhitelist && (publicAddress === address || (realAddress && publicAddress === realAddress))) &&
                !matchAddress(address, service.whitelistedAddresses) &&
                !(realAddress && matchAddress(realAddress, service.whitelistedAddresses))
            ) {
                log("WARN", `Un-whitelisted address '${formattedAddress}' attempted to connect to '${formattedServiceName}'`);
                return;
            }
        }

        // Blacklist
        if (service.blacklistedAddresses?.length) {
            if (
                matchAddress(address, service.blacklistedAddresses) ||
                (realAddress && matchAddress(realAddress, service.blacklistedAddresses))
            ) {
                log("WARN", `Blacklisted address '${formattedAddress}' attempted to connect to '${formattedServiceName}'`);
                return;
            }
        }

        // Authentication
        if (service.authentication) {
            let passedAuth = false;
            let authedUsername = null;
            const bypassedAuth = !!(
                (service.publicAddressBypassAuthentication && (publicAddress === address || (realAddress && publicAddress === realAddress))) ||
                (service.authenticationBypassedAddresses?.length && (
                    matchAddress(address, service.authenticationBypassedAddresses) ||
                    (realAddress && matchAddress(realAddress, service.authenticationBypassedAddresses))
                ))
            );

            if (!bypassedAuth) {
                if (service.authenticationType === "basic") {
                    // Basic authentication
                    const encodedAuthorization = http.getHeader("Authorization")?.match(/Basic (.+)/);
                    if (encodedAuthorization) {
                        const decodedAuthorization = Buffer.from(encodedAuthorization[1], "base64").toString();
                        const [username, password] = decodedAuthorization.split(":");
                        if (service.users?.length) {
                            const user = service.users.find(i => i?.username?.toLowerCase() === username?.toLowerCase());
                            if (user && matchPassword(user.password, service.passwordKey, password)) {
                                passedAuth = true;
                                authedUsername = user.username;
                            }
                        } else if (matchPassword(service.password, service.passwordKey, password)) passedAuth = true;
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
                                if (user && matchPassword(user.password, service.passwordKey, password)) {
                                    passedAuth = true;
                                    authedUsername = user.username;
                                }
                            }
                        } else if (matchPassword(service.password, service.passwordKey, password)) passedAuth = true;
                    }
                    if (!passedAuth) {
                        const authPage = formatPage("authentication", formatStringObject);
                        if (authPage) return connection.bypass(401, "Unauthorized", [["Content-Type", "text/html"]], formatPage("authentication", formatStringObject));
                        return connection.bypass(401, "Unauthorized");
                    }
                }
            }

            if (!passedAuth && !bypassedAuth) return; else {
                if (passedAuth) log("LOG", `'${formattedAddress}' authenticated${authedUsername ? ` as '${authedUsername}'` : ""} for '${formattedServiceName}'`);
                if (bypassedAuth) log("WARN", `'${formattedAddress}' bypassed authentication for '${formattedServiceName}'`);
            }
        }

        log("DEBUG", `${formattedAddress} went to ${formattedServiceName}, method: ${http.method}, target: ${http.target}, headers: ${JSON.stringify(http.headers)}`);

        // Is first HTTP request on connection
        if (connection.firstRequest) {
            connection.on("response", response => {
                // Modify response headers
                if (service.modifiedResponseHeaders) {
                    modifyHeaders(service.modifiedResponseHeaders, response, formatStringObject);
                }

                // Added to debug weird Cloudflare caching issue
                if (config.debug) {
                    response.setHeader("X-YAP-Host", host);
                    response.setHeader("X-YAP-Timestamp", new Date().toUTCString());
                    response.setHeader("X-YAP-Method", http.method);
                    response.setHeader("X-YAP-Protocol", http.protocol);
                    response.setHeader("X-YAP-Target", http.target);
                    response.setHeader("X-YAP-Headers", JSON.stringify(http.headers));
                    response.setHeader("X-YAP-Connection-Requests", connection.requests);
                    response.setHeader("X-YAP-Connection-Address", formattedAddress);
                    response.setHeader("X-YAP-Connection-Timestamp", connection.connectionDate.toUTCString());
                }
            });

            // Logging
            log("LOG", `'${formattedAddress}' connecting to '${formattedServiceName}'`);
            connection.on("close", () => {
                log("LOG", `'${formattedAddress}' disconnected from '${formattedServiceName}'`);
            });
            connection.on("client-error", err => {
                log("ERROR", `Client error for '${formattedServiceName}',`, err);
            });
            connection.on("origin-error", err => {
                log("ERROR", `Origin error for '${formattedServiceName}',`, err);
            });
            connection.on("client-data", (data, http) => {
                log("DEBUG", `Client data for '${formattedServiceName}': ${data.byteLength}`);
            });
            connection.on("origin-data", (data, http) => {
                log("DEBUG", `Origin data for '${formattedServiceName}': ${data.byteLength}`);
            });
        }

        // Redirect public to local if possible
        if (publicAddress === (realAddress || address) && service.redirectPublicToLocal && service.localHostname && serviceHost.endsWith(".")) return connection.bypass(307, "Temporary Redirect", [["Location", `${config.ssl ? "https" : "http"}://${formatString(service.localHostname, formatStringObject)}:${config.port}${http.target}`]]);

        // Modify request headers
        if (service.modifiedRequestHeaders) {
            modifyHeaders(service.modifiedRequestHeaders, http, formatStringObject);
        }

        // Force target
        if (service.forceTarget) {
            http.target = service.forceTarget;
        }

        // Disallow robots
        if (service.disallowRobots && http.target === "/robots.txt") {
            return connection.bypass(200, "OK", [["Content-Type", "text/plain"]], "User-agent: *\nDisallow: /");
        }
        
        // URL bypassed
        if (service.urlBypassed) {
            const urlBypassed = service.urlBypassed[Object.keys(service.urlBypassed).find(i => matchUrl(i, http.target))];
            if (urlBypassed) {
                if (urlBypassed.service) {
                    const urlBypassedService = typeof urlBypassed.service === "string" ? services.find(i => i.name === urlBypassed.service) : urlBypassed.service;
                    if (!urlBypassedService) return;
                    return assignService(urlBypassedService);
                } else {
                    return connection.bypass(
                        urlBypassed.status || 200,
                        urlBypassed.statusText || "OK",
                        urlBypassed.headers || [["Content-Type", urlBypassed.page ? "text/html" : "text/plain"]],
                        urlBypassed.page ? formatPage(urlBypassed.page, formatStringObject) : urlBypassed.data
                    );
                }
            }
        }
        
        if (service.redirect) {
            // Redirect
            return connection.bypass(307, "Temporary Redirect", [["Location", formatString(service.redirect, formatStringObject)]]);
        }
        else if (service.originHost && service.originPort) {
            // Proxy
            return connection.proxy({
                host: service.originHost,
                port: service.originPort,
                ssl: service.ssl,
                connectionOptions: service.connectionOptions
            });
        }
    }

    for (const service of services) {
        if (!matchHost(service.hosts, hostname)) continue;

        return assignService(service);
    }

    log("LOG", `'${formattedAddress}' went to unknown host '${hostname}'`);

    const unknownHostPage = formatPage("unknownHost", formatStringObject);
    if (unknownHostPage) return connection.bypass(404, "Not Found", [["Content-Type", "text/html"]], unknownHostPage);
});

proxy.on("connection", connection => {
    log("DEBUG", `${proxy.connections.length} connection(s): ${proxy.connections.map(i => i.clientConnection.remoteAddress).join(", ")}`);
    if (config.maxConnections && proxy.connections.length > config.maxConnections) {
        // Over connection limit
        const connectionLimitPage = formatPage("connectionLimit");
        return connection.bypass(503, "Service Unavailable", [["Retry-After", 1], ...(connectionLimitPage ? [["Content-Type", "text/html"]] : [])], connectionLimitPage);
    }
});

proxy.on("close", connection => {
    log("DEBUG", `Closed`);
});

proxy.listen(args.port.value || config.port || (config.ssl ? 443 : 80), args.hostname.value || config.hostname || "0.0.0.0", () => log("INFO", `Proxy listening at ${proxy.hostname}:${proxy.port}`));

// Functions

function initServices() {
    return new DirectoryMonitor(args.services.value || config.servicesLocation, {
        loaded: files => log("INFO", `Loaded ${files.length} service${files.length > 1 ? "s" : ""}`),
        loadError: (err, filePath) => log("ERROR", `Error loading service '${filePath}', ${err}`),
        reloadError: (err, filePath) => log("ERROR", `Error reloading service '${filePath}', ${err}`),
        change: filename => log("INFO", `Reloading service '${filename}'`),
        delete: filename => log("INFO", `Unloading service '${filename}'`),
        create: filename => log("INFO", `Loading service '${filename}'`),
        fileFilter: filePath => {
            if (path.extname(filePath) !== ".json") return false; // File is not a service
            if (path.basename(filePath).startsWith("_")) return false; // File starts with "_", disable
            return true;
        },
        parser: (data, filePath) => {
            const originalService = parseService(JSON.parse(data));

            // Combine default service options and service
            const service = {
                name: originalService.name || path.basename(filePath, path.extname(filePath)),

                ...(config.defaultServiceOptions || {}),
                ...originalService
            }
            if (service.modifiedRequestHeaders) service.modifiedRequestHeaders = [
                ...(config.defaultServiceOptions?.modifiedRequestHeaders || []),
                ...(originalService.modifiedRequestHeaders || [])
            ];
            if (service.originHost && !service.originPort) service.originPort = service.ssl ? 443 : 80;

            // Check if service is valid
            if (service.authentication) {
                if (!service.users?.length && !service.password) throw new Error("Service authentication enabled but no users or password set");
                if (service.authenticationType !== "basic" && service.authenticationType !== "cookies") throw new Error(`Unknown authentication type '${service.authenticationType}'`);
            }
            if (service.originPort && (service.originPort < 0 || service.originPort > 65535)) throw new Error("Invalid origin port");
            if (!service.redirect && !service.urlBypassed && (!service.originHost || !service.originPort)) throw new Error("Nothing to do");

            return service;
        }
    }).files;
}

function initPages() {
    if (!args.pages.value && !config.pagesLocation) return;
    return new DirectoryMonitor(args.pages.value || config.pagesLocation, {
        depth: 0,
        loaded: files => log("INFO", `Loaded ${files.length} page${files.length > 1 ? "s" : ""}`),
        loadError: (err, filePath) => log("ERROR", `Error loading page '${filePath}', ${err}`),
        reloadError: (err, filePath) => log("ERROR", `Error reloading page '${filePath}', ${err}`),
        change: filename => log("INFO", `Reloading page '${filename}'`),
        delete: filename => log("INFO", `Unloading page '${filename}'`),
        create: filename => log("INFO", `Loading page '${filename}'`),
        fileFilter: filePath => {
            if (path.extname(filePath) !== ".html") return false; // File is not HTML
            if (!Object.values(config.pageLocations || {}).includes(path.basename(filePath))) return false; // File is not a page
            return true;
        },
        parser: (data, filePath) => {
            return {
                page: Object.keys(config.pageLocations).find(i => config.pageLocations[i] === path.basename(filePath)),
                data
            }
        }
    }).files;
}

function formatPage(page, formatStringObject = {}) {
    return formatString(pages.find(i => i.page === page)?.data || "", formatStringObject);
}

function log(level, ...msgs) {
    if (!config.logLevels?.includes(level)) return;
    console.log(`${config.includeTimestamp ? `[${new Date().toLocaleString()}] ` : ""}[${level}]`, ...msgs);
}