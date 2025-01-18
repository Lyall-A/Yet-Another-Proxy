class HTTP {
    constructor(data) {
        this.data = data;
        this.dataString = data.toString();

        if (this.isRequest()) {
            // HTTP request
            const requestMatch = this.dataString.match(this.requestRegex);
            if (!requestMatch) throw new Error("Malformed HTTP request");
            const [match, method, target, protocol, rawHeaders, rawData] = requestMatch;
            console.log(match)

            this.method = method;
            this.target = target;
            this.protocol = protocol;
            this.rawHeaders = rawHeaders;
            this.rawData = rawData;

            this.headers = this.parseHeaders();
        } else if (this.isResponse()) {
            // HTTP response
            const responseMatch = this.dataString.match(this.responseRegex);
            if (!responseMatch) throw new Error("Malformed HTTP response");
            const [match, protocol, statusCode, statusMessage, rawHeaders, rawData] = responseMatch;

            this.protocol = protocol;
            this.statusCode = statusCode;
            this.statusMessage = statusMessage;
            this.rawHeaders = rawHeaders;
            this.rawData = rawData;

            this.headers = this.parseHeaders();
        } else {
            // Invalid
            throw new Error("Not a valid HTTP request/response");
        }
    }

    isRequest() {
        return this.dataString.match(this.requestLineRegex) ? true : false;
    }

    isResponse() {
        return this.dataString.match(this.responseLineRegex) ? true : false;
    }

    parseHeaders() {
        return Array.from(this.rawHeaders.matchAll(this.headersRegex)).map(([match, key, value]) => ([key, value]));
    }

    headersRegex = /([\w-]+):\s?(.*)/g;
    requestLineRegex = /^([A-Z]+)\s(\S+)\s(HTTP\/\d+\.\d+)/; // HTTP request line only
    responseLineRegex = /^(HTTP\/\d+\.\d+)\s(\d+)\s(.*)/; // HTTP response line only
    requestRegex = /^([A-Z]+)\s(\S+)\s(HTTP\/\d+\.\d+)\r?\n((?:[\w-]+:\s?.*\r?\n)*)\r?\n([\s\S]*)$/; // Entire HTTP request
    responseRegex = /^(HTTP\/\d+\.\d+)\s(\d+)\s(.*)\r?\n((?:[\w-]+:\s?.*\r?\n)*)\r?\n([\s\S]*)$/; // Entire HTTP response
}

module.exports = HTTP;