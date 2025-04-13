# Yet Another Proxy
A HTTP proxy based on the `Host` header (eg: `plex.example.org` > `localhost:32400`)

## Features
* Cookie authentication with [page](./pages/authentication.html)
* HTTP Basic authentication
* Authentication bypass depending on IP/CIDR
* Redirect to local host if accessing from same network
* Disallow robots
* Whitelist IP/CIDR (including real IP)
* Blacklist IP/CIDR (including real IP)
* Redirections
* URL bypass
* Modify request and response headers
* Easy to configure

The default configuration whitelist's [Cloudflare's IPv4 ranges](https://www.cloudflare.com/ips) and local IP's by default

## Usage
* `node .` to start or `node . --help` for a list of optional arguments

## Configuration
* TODO

## Troubleshooting
* **If you have too much connections open at the same time:**
  * Add `Connection: close` header to `modifiedRequestHeaders` or/and `modifiedResponseHeaders`, this should prevent multiple requests from being sent over the same connection

## Notes
* ~~If using Cloudflare, there is an issue with caching that can cause the response to be from a completely different service or path~~ should be fixed as of [d1290dc](https://github.com/Lyall-A/Yet-Another-Proxy/commit/d1290dc), I think this was caused from Cloudflare using the same TCP connection for multiple services

* If using Cloudflare caching, you should add a cache rule that bypasses any requests containing the `YAP-Username` or `YAP-Password` cookie

* I've found many bugs with [Bun](https://bun.sh/) relating to the HTTP and Net modules, but Bun will *probably* work (`bun .`)

## TODO's
* API server (and maybe frontend) to configure the proxy
