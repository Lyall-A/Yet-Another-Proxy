const net = require("net");

const connection = net.createConnection({
    host: "127.0.0.1",
    port: 8080
}, () => {
    connection.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
    
    connection.once("data", data => {
        console.log("DATA:", data.toString());
        
        connection.write("GET / HTTP/1.1\r\nHost: media.\r\n\r\n");

        connection.once("data", data => {
            console.log("DATA:", data.toString());
        });
    });
});