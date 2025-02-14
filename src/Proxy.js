const net = require("net");
const tls = require("tls");
const fs = require("fs");
const { EventEmitter } = require("events");

const Connection = require("./Connection");
const ProxyConnection = require("./ProxyConnection");

class Proxy extends EventEmitter {
    constructor(options = { }) {
        super();

        this.serverOptions = {
            ...(options.serverOptions || { })
        };

        if (options.ssl) {
            // With SSL (HTTPS)
            if ((!options.cert && !options.certFile) || (!options.key && !options.keyFile)) throw new Error("No key or certificate provided for server");

            if (!this.serverOptions.cert) this.serverOptions.cert = options.cert || fs.readFileSync(options.certFile, "utf-8");
            if (!this.serverOptions.key) this.serverOptions.key = options.key || fs.readFileSync(options.keyFile, "utf-8");

            this.server = tls.createServer(this.serverOptions);
        } else {
            // Without SSL (HTTP)
            this.server = net.createServer(this.serverOptions);
        }

        this.server.on("connection", socket => {
            const clientConnection = new Connection(socket);
            if (!clientConnection.remoteAddress) return clientConnection.destroy(); // Weird thing that happens

            const connection = new ProxyConnection(clientConnection);
            this.connections.push(connection);

            connection.on("close", () => {
                const connectionIndex = this.connections.findIndex(i => i === connection);
                if (connectionIndex >= 0) this.connections.splice(connectionIndex, 1);
            });

            clientConnection.on("data", (data, http) => {
                connection.emit("client-data", data, http);

                if (http) {
                    this.emit("request", http, connection);
                    connection.firstRequest = false;
                }
                
                if (connection.state === 0) return connection.close();
                if (connection.state > 0) connection.writeOrigin(http ? http.toBuffer() : data);
            });

            clientConnection.on("close", () => {
                connection.emit("client-close");
                connection.close();
            });

            clientConnection.on("error", err => {
                // console.log(err);
                connection.emit("client-error", err);
                connection.close();
            });

            clientConnection.on("drain", () => connection.originConnection.resume());
        });
    }

    connections = [ ];
    port = 80;
    hostname = "0.0.0.0";

    listen(port, hostname, callback) {
        this.port = port || this.port;
        this.hostname = hostname || this.hostname;
        this.server.listen(this.port, this.hostname, callback);
    }
}

module.exports = Proxy;