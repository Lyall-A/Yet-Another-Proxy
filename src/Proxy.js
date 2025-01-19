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

            if (!this.serverOptions.cert) this.serverOptions.cert = options.cert || fs.readFileSync(options.certFile);
            if (!this.serverOptions.key) this.serverOptions.key = options.key || fs.readFileSync(options.keyFile);

            this.server = tls.createServer(this.serverOptions);
        } else {
            // Without SSL (HTTP)
            this.server = net.createServer(this.serverOptions);
        }

        this.server.on("connection", socket => {
            const clientConnection = new Connection(socket);
            if (!clientConnection.address) return clientConnection.destroy(); // Weird thing that happens

            const connection = new ProxyConnection(clientConnection);
            this.connections.push(connection);

            connection.on("close", () => {
                const connectionIndex = this.connections.findIndex(i => i === connection);
                if (connectionIndex >= 0) this.connections.splice(connectionIndex, 1);
            });

            clientConnection.on("data", (data, http) => {
                connection.emit("client-data", data, http);

                if (http) {
                    if (connection.state === 0) this.emit("request", http, connection);
                
                    if (connection.state === 0) return connection.close();
                    if (connection.state > 0) connection.writeOrigin(http.toBuffer());
                } else {
                    if (connection.state === 0) return connection.close();
                    if (connection.state > 0) connection.writeOrigin(data);
                }
            });

            clientConnection.on("close", () => {
                connection.close();
            });

            clientConnection.on("error", err => {
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