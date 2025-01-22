const fs = require("fs");
const path = require("path");

function getFiles(dirPath, options = { }) {
    return (function getFilesDir(dirPath, depth = 0) {
        const files = [ ];
        const dir = fs.readdirSync(dirPath).filter(options.filter || (() => true));
        for (const filePath of dir) {
            const fullPath = path.resolve(dirPath, filePath);
            if (fs.lstatSync(fullPath).isDirectory()) {
                if (options.excludeDir && fullPath.match(options.excludeDir)) continue;
                if (options.includeDir && !fullPath.match(options.includeDir)) continue;
                if ((options.depth || options.depth === 0) && depth >= options?.depth) continue;
                files.push(...getFilesDir(fullPath, depth + 1));
            } else {
                if (options.excludeFile && fullPath.match(options.excludeFile)) continue;
                if (options.includeDir && !fullPath.match(options.includeDir)) continue;
                files.push(fullPath);
            }
        }
        return files;
    })(dirPath, 0);
}

module.exports = getFiles;