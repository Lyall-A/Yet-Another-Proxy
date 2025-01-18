const net = require("net");
const tls = require("tls");
const fs = require("fs");
const { EventEmitter } = require("events");

const Connection = require("./Connection");
const HTTP = require("./HTTP");

class Proxy extends EventEmitter {
    constructor(options = { }) {
        super();

        this.serverOptions = {
            ...(options.serverOptions || { })
        };

        if (options.tls) {
            // With TLS (HTTPS)
            if ((!options.cert && !options.certFile) || (!options.key && !options.keyFile)) throw new Error("No key or certificate provided");

            if (!this.serverOptions.cert) this.serverOptions.cert = options.cert || fs.readFileSync(options.certFile);
            if (!this.serverOptions.key) this.serverOptions.key = options.key || fs.readFileSync(options.keyFile);

            this.server = tls.createServer(this.serverOptions);
        } else {
            // Without TLS (HTTP)
            this.server = net.createServer(this.serverOptions);
        }

        this.server.on("connection", socket => {
            const connection = new Connection(socket);
            if (!connection.address) return connection.destroy();

            connection.on("data", data => {
                try {
                    const http = new HTTP(data);
                    console.log(http.headers)
                } catch (err) {
                    // Doesn't include HTTP header
                }
            });

            // new net.Socket()
        });
    }

    port = 80;
    hostname = "0.0.0.0";

    listen(port, hostname, callback) {
        this.port = port || this.port;
        this.hostname = hostname || this.hostname;
        this.server.listen(this.port, this.hostname, callback);
    }
}

module.exports = Proxy;