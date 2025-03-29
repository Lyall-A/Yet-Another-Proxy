const tls = require("tls");

(function test() {
    const connection = tls.connect({
        host: "lyall-a.github.io",
        port: 443,
        rejectUnauthorized: false
    }, () => {
        connection.write("GET /assets/banner.gif HTTP/1.1\r\nHost: lyall.lol\r\nConnection: close\r\n\r\n");
    
        const interval = setInterval(() => {
            speeds.push(lastSpeed);
            lastSpeed = 0;
        }, 1000);
        const speeds = [];
        let lastSpeed = 0;
    
        connection.on("data", data => {
            console.log(`Got ${data.byteLength} bytes`);
            lastSpeed += data.length;
        });
    
        connection.on("close", () => {
            clearInterval(interval);
            if (lastSpeed) speeds.push(lastSpeed);
    
            const minimum = Math.min(...speeds);
            const maximum = Math.max(...speeds);
            const average = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    
            console.log(`Minimum: ${Math.floor((minimum / 1024 / 1024) * 100) / 100} MB/s`);
            console.log(`Maximum: ${Math.floor((maximum / 1024 / 1024) * 100) / 100} MB/s`);
            console.log(`Average: ${Math.floor((average / 1024 / 1024) * 100) / 100} MB/s`);

            test();
        });
    });
})();