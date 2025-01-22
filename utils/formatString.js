function formatString(string, object = {}) {
    return string.replace(/\\?(?:{{(.+?)}}|%%(.*?)%%)/gs, (match, objectGroup, evalGroup) => {
        if (match.startsWith("\\")) return match.slice(1);

        if (objectGroup) {
            return objectGroup.split(".").reduce((acc, key) => acc && acc[key], object) ?? "";
        }

        if (evalGroup) {
            try {
                return eval(`${Object.entries(object).map(([key, value]) => `const ${key} = ${JSON.stringify(value)};`).join("\n")}\n\n${evalGroup}`);
            } catch (err) {
                return "";
            }
        }

        return match;
    });
}

module.exports = formatString;