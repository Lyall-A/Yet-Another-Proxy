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

        this.address = this.remoteAddress;
        this.port = this.remotePort;

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
        
        this.connection.on("open", () => this.emit("open"));
        this.connection.on("end", () => this.emit("end"));
        this.connection.on("close", () => this.emit("close"));
        this.connection.on("error", err => this.emit("error", err));
        this.connection.on("drain", () => this.emit("drain"));
    }

    pause() {
        this.connection.pause();
    }

    resume() {
        this.connection.resume();
    }

    write(data) {
        return this.connection.write(data);
    }

    end(data) {
        this.connection.end(data);
    }

    destroy() {
        this.connection.destroy();
    }
}

module.exports = Connection;