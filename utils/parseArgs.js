function parseArgs(args, argOptions) {
    const parsed = { };

    for (const argOption of argOptions) {
        const argName = argOption.name || argOption.long;
        const parsedArg = {
            short: argOption.short,
            long: argOption.long,
            type: argOption.type || "string",
            present: false,
            value: argOption.default,
        };
        
        const shortArgIndex = argOption.short ? args.indexOf(`-${argOption.short}`) : -1;
        const longArgIndex = argOption.long ? args.indexOf(`--${argOption.long}`) : -1;
        
        const argValueIndex = Math.max(shortArgIndex, longArgIndex) + 1;
        const argValue = args[argValueIndex]?.match(/^([^-].*)/)?.[1];

        if (argValueIndex > 0) {
            parsedArg.present = true;

            if (argValue !== undefined) {
                if (argOption.type === "bool") {
                    if (argValue === "0" || argValue.toLowerCase() === "false") {
                        parsedArg.value = false;
                    } else {
                        parsedArg.value = true;
                    }
                } else
                if (argOption.type === "int") {
                    parsedArg.value = parseInt(argValue);
                } else
                if (argOption.type === "float") {
                    parsedArg.value = parseFloat(argValue);
                } else {
                    parsedArg.value = argValue;
                }
            }
        }

        parsed[argName] = parsedArg;
    };

    return parsed;
}

module.exports = parseArgs;