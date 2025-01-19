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
    state = 0; // 0: Not connecting, 1: Connecting, 2: Connected

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
    
    proxy(options = { }) {
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
            if ((!options.cert && !options.certFile) || (!options.key && !options.keyFile)) throw new Error("No key or certificate provided for connection");
            
            if (!originConnectionOptions.cert) originConnectionOptions.cert = options.cert || fs.readFileSync(options.certFile);
            if (!originConnectionOptions.key) originConnectionOptions.key = options.key || fs.readFileSync(options.keyFile);
            
            this.originConnection = new Connection(tls.connect(originConnectionOptions));
        } else {
            // Without SSL (HTTP)
            this.originConnection = new Connection(net.connect(originConnectionOptions));
        }

        this.originConnection.on("open", () => {
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
            this.close();
        });

        this.originConnection.on("error", err => {
            this.close();
        });

        this.originConnection.on("drain", () => this.clientConnection.resume());
    }
}

module.exports = ProxyConnection;