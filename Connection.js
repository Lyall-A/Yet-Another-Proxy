class Connection {
    constructor(socket) {
        this.socket = socket;

        this.localAddress = socket.localAddress;
        this.remoteAddress = socket.remoteAddress;
        this.localPort = socket.localPort;
        this.remotePort = socket.remotePort;

        this.address = this.remoteAddress;
        this.port = this.remotePort;
    }

    on(eventName, callback) {
        this.socket.on(eventName, callback);
    }

    once(eventName, callback) {
        this.socket.once(eventName, callback);
    }

    write(data) {
        if (!this.socket.write(data)) {
            
        }
    }

    destroy() {
        this.socket.destroy();
    }
}

module.exports = Connection;