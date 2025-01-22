class HTTP {
    constructor(data) {
        this.data = data;
        this.dataString = data.toString();

        if (this.isRequest()) {
            // HTTP request
            const requestMatch = this.dataString.match(HTTP.requestRegex);
            if (!requestMatch) throw new Error("Malformed HTTP request");
            const [match, method, target, protocol, headersString] = requestMatch;

            this.method = method; // GET
            this.target = target; // /
            this.protocol = protocol; // HTTP/1.1
            this.headersString = headersString;
            this.rawData = data.subarray(data.indexOf(HTTP.delimiter) + HTTP.delimiter.length);
            
            this.startLine = `${method} ${target} ${protocol}`;
            this.parseHeaders();
            this.parseCookies();
        } else if (this.isResponse()) {
            // HTTP response
            const responseMatch = this.dataString.match(HTTP.responseRegex);
            if (!responseMatch) throw new Error("Malformed HTTP response");
            const [match, protocol, statusCode, statusMessage, headersString] = responseMatch;

            this.protocol = protocol; // HTTP/1.1
            this.statusCode = statusCode; // 200
            this.statusMessage = statusMessage; // OK
            this.headersString = headersString;
            this.rawData = data.subarray(data.indexOf(HTTP.delimiter) + HTTP.delimiter.length);

            this.startLine = `${protocol} ${statusCode} ${statusMessage}`;
            this.parseHeaders();
            this.parseCookies();
        } else {
            // Invalid
            throw new Error("Not a valid HTTP request/response");
        }
    }

    toBuffer() {
        return Buffer.concat([
            Buffer.from(this.startLine),
            Buffer.from("\r\n"),
            Buffer.from(this.stringifyHeaders()),
            Buffer.from(HTTP.delimiter),
            this.rawData
        ]);
    }

    isRequest() {
        return this.dataString.match(HTTP.requestLineRegex) ? true : false;
    }

    isResponse() {
        return this.dataString.match(HTTP.responseLineRegex) ? true : false;
    }

    parseHeaders() {
        const headers = Array.from(this.headersString.matchAll(HTTP.headersRegex)).map(([match, key, value]) => ([key, value]));
        this.headers = headers;
        return this.headers;
    }

    parseCookies() {
        const cookieHeader = this.getHeader("Cookie");
        this.cookies = cookieHeader ? Object.fromEntries(cookieHeader.split("; ").map(i => { const [key, value] = i.split("="); return [key, value]; })) : { };
        return this.cookies;
    }

    stringifyHeaders() {
        return this.headers.map(([key, value]) => `${key}: ${value}`).join("\r\n");
    }

    getHeader(key, defaultValue) {
        const header = this.headers.find(([i]) => i.toLowerCase() === key.toLowerCase());
        if (!header && defaultValue) this.addHeader(key, defaultValue);
        return header?.[1] || defaultValue;
    }
    
    addHeader(key, value) {
        this.headers.push([key, value]);
        return this.headers;
    }

    // NOTE: will only set first header found with key
    setHeader(key, value) {
        const header = this.headers.find(([i]) => i.toLowerCase() === key.toLowerCase());
        if (header) header[1] = value; else this.addHeader(key, value);
        return this.headers;
    }

    // NOTE: will only remove first header found with key
    removeHeader(key, value) {
        const headerIndex = this.headers.findIndex(([i]) => i.toLowerCase() === key.toLowerCase());
        if (headerIndex >= 0) this.headers.splice(headerIndex, 1);
        return this.headers;
    }

    static delimiter = "\r\n\r\n";
    static headersRegex = /([\w-]+):\s?(.*)/g;
    static requestLineRegex = /^([A-Z]+)\s(\S+)\s(HTTP\/\d+\.\d+)/; // HTTP request line only
    static responseLineRegex = /^(HTTP\/\d+\.\d+)\s(\d+)\s(.*)/; // HTTP response line only
    static requestRegex = /^([A-Z]+)\s(\S+)\s(HTTP\/\d+\.\d+)\r\n((?:[\w-]+:\s?.*\r\n)*)\r\n/; // HTTP request line and headers
    static responseRegex = /^(HTTP\/\d+\.\d+)\s(\d+)\s(.*)\r\n((?:[\w-]+:\s?.*\r\n)*)\r\n/; // HTTP response line and headers
}

module.exports = HTTP;