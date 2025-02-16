const net = require("net");
const tls = require("tls");
const fs = require("fs");
const { EventEmitter } = require("events");

const Connection = require("./Connection");

class ProxyConnection extends EventEmitter {
    constructor(clientConnection) {
        super();

        this.clientConnection = clientConnection;

        clientConnection.on("data", (data, http) => {
            this.emit("client-data", data, http);

            if (http) {
                this.requests++;
                this.emit("request", http);
                this.firstRequest = false;
            }
            
            if (this.state === 0) return this.close();
            if (this.state > 0) this.writeOrigin(http ? http.toBuffer() : data);
        });

        clientConnection.on("close", () => {
            this.emit("client-close");
            this.close();
        });

        clientConnection.on("error", err => {
            // console.log(err);
            this.emit("client-error", err);
            this.close();
        });

        clientConnection.on("drain", () => this.originConnection.resume());
    }

    originConnection = null;
    originOptions = null;
    originConnectionOptions = null;
    connectionDate = new Date();
    state = 0; // -1: Bypass/Not relevant, 0: Not connecting, 1: Connecting, 2: Connected
    requests = 0;
    firstRequest = true;

    close() {
        this.clientConnection.destroy();
        this.closeOrigin();

        this.emit("close");
    }

    closeOrigin() {
        if (this.originConnection) this.originConnection.destroy();
        this.state = 0;
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
        if (this.state > 0) {
            if (options.host !== this.originOptions.host || options.port !== this.originOptions.port) {
                // console.log(`Changing origin ${this.originOptions.host}:${this.originOptions.port} > ${options.host}:${options.port}`);
                // Fix for sending requests to multiple origins on the same connection
                this.closeOrigin();
            } else {
                return;
            }
        };
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

        this.originConnection.on(options.ssl ? "secureConnect" : "connect", () => {
            this.emit("origin-open");
            this.state = 2;
        });

        this.originConnection.on("data", (data, http) => {
            this.emit("origin-data", data, http);

            if (http) {
                this.emit("response", http);
                this.writeClient(http.toBuffer());
            } else {
                this.writeClient(data);
            }
        });

        this.originConnection.on("close", () => {
            if (options.host === this.originOptions.host && options.port === this.originOptions.port) {
                this.emit("origin-close");
                this.close();
            } else {
                this.emit("origin-change");
            }
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