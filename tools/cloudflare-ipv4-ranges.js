console.log("Getting Cloudflare IPv4 ranges");

fetch("https://www.cloudflare.com/ips-v4").then(i => i.text()).then(ips => {
    console.log();
    console.log("Cloudflare IPv4 ranges:");
    console.log(ips);
    console.log();
    console.log("JSON formatted:");
    console.log(JSON.stringify(ips.split("\n"), null, 4))
});
