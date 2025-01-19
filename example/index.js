const fs = require("fs");
const path = require("path");
const Proxy = require("../src/Proxy");

const proxy = new Proxy();

const services = [];

proxy.on("request", (http, connection) => {
    for (const service of services) {
        if (service["host"] === http.getHeader("Host")) {
            console.log(`Proxying ${service["host"]} to ${service["originHost"]}:${service["originPort"]}`);

            connection.proxy({
                host: service["originHost"],
                port: service["originPort"]
            });

            connection.on("client-data", (data, http) => console.log("Data from client"));
            connection.on("origin-data", (data, http) => console.log("Data from origin"));
            // connection.on("origin-data", (data, http) => {
                // console.log("Data from origin");
                // if (http) http.setHeader("Skibidi", "lol")
            // });
        }
    }
});

proxy.listen(80, "0.0.0.0", () => console.log(`Proxy listening at ${proxy.hostname}:${proxy.port}`));

loadServices();
function loadServices() {
    const root = "./services";
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
    })(root);

    for (const serviceFile of serviceFiles) {
        services.push(require(serviceFile));
        // (function parseServiceFile(serviceFilePath) {
        //     const serviceFile = fs.readFileSync(serviceFilePath, "utf-8");
        //     const service = Object.fromEntries(Array.from(serviceFile.matchAll(/([a-zA-Z0-9_]+)\s*=\s*(.*)/g)).map(([match, key, value]) => ([ key, value ])));
        //     services.push(service);
        // })(serviceFile)
    }
}