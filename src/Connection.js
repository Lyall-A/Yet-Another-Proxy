const { EventEmitter } = require("events");

const HTTP = require("./HTTP");

class Connection extends EventEmitter {
    constructor(connection) {
        super();

        this.connection = connection;

        this.localAddress = connection.localAddress;
        this.remoteAddress = connection.remoteAddress;
        this.localPort = connection.localPort;
        this.remotePort = connection.remotePort;

        this.connection.on("data", data => {
            let http = null;
            try {
                // Includes HTTP header, parse it to modify headers
                http = new HTTP(data);
            } catch (err) {
                // Doesn't include HTTP header, just send raw data
                // console.log(err);
            }
            this.emit("data", data, http);
        });
        
        this.connection.on("secureConnect", () => this.emit("secureConnect"));
        this.connection.on("connect", () => this.emit("connect"));
        this.connection.on("end", () => this.emit("end"));
        this.connection.on("close", () => this.emit("close"));
        this.connection.on("error", err => this.emit("error", err));
        this.connection.on("drain", () => this.emit("drain"));
    }

    pause() {
        return this.connection.pause();
    }

    resume() {
        return this.connection.resume();
    }

    write(data) {
        return this.connection.write(data);
    }

    end(data) {
        return this.connection.end(data);
    }

    destroy() {
        return this.connection.destroy();
    }
}

module.exports = Connection;