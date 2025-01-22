const net = require("net");
const tls = require("tls");
const fs = require("fs");
const { EventEmitter } = require("events");

const Connection = require("./Connection");

class ProxyConnection extends EventEmitter {
    constructor(clientConnection) {
        super();

        this.clientConnection = clientConnection;
    }

    originConnection = null;
    originOptions = null;
    originConnectionOptions = null;
    connectTimestamp = Date.now();
    state = 0; // -1: Bypass, 0: Not connecting, 1: Connecting, 2: Connected
    firstRequest = true;

    close() {
        this.clientConnection.destroy();
        if (this.originConnection) this.originConnection.destroy();

        this.emit("close");
    }

    writeClient(data) {
        if (!this.clientConnection.write(data)) {
            this.originConnection.pause();
        }
    }

    writeOrigin(data) {
        if (!this.originConnection.write(data)) {
            this.clientConnection.pause();
        }
    }

    bypass(statusCode, statusMessage = "", headers = [], data = "") {
        this.state = -1;

        this.clientConnection.end(`HTTP/1.1 ${statusCode} ${statusMessage}\r\n${headers.map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n${data}`);
    }
    
    proxy(options = { }) {
        if (this.state > 0) return;
        this.state = 1;
        this.originOptions = options;
        
        const originConnectionOptions = {
            host: options.host,
            port: options.port,
            rejectUnauthorized: false,
            ...(options.connectionOptions || { })
        };
        this.originConnectionOptions = originConnectionOptions;
        
        if (options.ssl) {
            // With SSL (HTTPS)
            this.originConnection = new Connection(tls.connect(originConnectionOptions));
        } else {
            // Without SSL (HTTP)
            this.originConnection = new Connection(net.connect(originConnectionOptions));
        }

        this.originConnection.on("open", () => {
            this.emit("origin-open");
            this.state = 2;
        });

        this.originConnection.on("data", (data, http) => {
            this.emit("origin-data", data, http);

            if (http) {
                this.writeClient(http.toBuffer());
            } else {
                this.writeClient(data);
            }
        });

        this.originConnection.on("close", () => {
            this.emit("origin-close");
            this.close();
        });

        this.originConnection.on("error", err => {
            // console.log(err);
            this.emit("origin-error", err);
            this.close();
        });

        this.originConnection.on("drain", () => this.clientConnection.resume());
    }
}

module.exports = ProxyConnection;