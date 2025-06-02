module.exports = {
    localAddresses: [
        "::1",
        "127.0.0.1",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16"
    ],
    argOptions: [
        { long: "help", short: "h", description: "This help menu" },
        { long: "config", description: "Use a different config file", default: "./config.json" },
        { long: "services", description: "Use a different services directory" },
        { long: "pages", description: "Use a different pages directory" },
        { long: "hostname", description: "Listen on hostname", default: "0.0.0.0" },
        { long: "hostname2", description: "Listen on hostname (SSL)" },
        { long: "port", description: "Listen on port", type: "int" },
        { long: "port2", description: "Listen on port (SSL), define with SSL enabled to run a TCP and SSL server", type: "int" },
        { long: "debug", description: "Enable debug mode (currently only adds extra information to response headers)" },
        { long: "secure", description: "Enable SSL", type: "bool" },
        { long: "cert", description: "Certificate file" },
        { long: "key", description: "Private key file" },
    ]
}