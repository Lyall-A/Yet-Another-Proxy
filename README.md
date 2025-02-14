# Yet Another Proxy
A HTTP proxy based on the `Host` header (eg: `plex.example.org` > `localhost:32400`)

## Features
* Cookie authentication with [page](./pages/authentication.html)
* Basic authentication
* Authentication bypass depending on IP/CIDR
* Disallow robots
* Display real IP
* Whitelist IP/CIDR
* Blacklist IP/CIDR
* Redirections
* URL bypass
* Modify request and response headers
* Can be imported as JS module
* Easy to configure

The default configuration whitelist's [Cloudflare's IPv4 ranges](https://www.cloudflare.com/ips) and local IP's by default

## Usage
* `node .` to start or `node . --help` for a list of optional arguments

## Notes
* If using Cloudflare, there is an issue with caching that can cause the response to be from a completely different service or path

* Cloudflare caching is not recommended but if using, add a cache rule that bypasses any requests containing the `YAP-Username` or `YAP-Password` cookie

* I've found many bugs with [Bun](https://bun.sh/) relating to the HTTP and Net modules, but Bun will *probably* work (`bun .`)

## TODO's
* API server (and maybe frontend) to configure the proxy
