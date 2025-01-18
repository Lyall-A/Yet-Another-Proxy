const Proxy = require("./Proxy");

const proxy = new Proxy();

proxy.on("request", a => {
    console.log(a)
});

proxy.listen(8080, "0.0.0.0", () => console.log(`Proxy listening at ${proxy.hostname}:${proxy.port}`));