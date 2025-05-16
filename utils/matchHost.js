function matchHost(hosts, hostname) {
    return hosts?.find(i =>
        i === hostname ||
        (i.startsWith(".") && hostname.endsWith(i)) ||
        (i.endsWith(".") && hostname.startsWith(i))
    );
}

module.exports = matchHost;
