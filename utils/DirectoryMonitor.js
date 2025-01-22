const fs = require("fs");
const path = require("path");

const getFiles = require("./getFiles");

class DirectoryMonitor {
    constructor(directory, options = {}) {
        this.directory = directory;
        this.options = options;

        this.loadFiles();
        this.watch();
    }

    files = [];
    watcher = null;

    watch() {
        this.watcher = fs.watch(this.directory, { recursive: true }, (event, filename) => {
            if (this.options.fileFilter && !this.options.fileFilter(filename)) return;

            const filePath = path.resolve(this.directory, filename);

            if (event === "change") {
                // "change" can mean the file was modified
                this.options.change?.(filename, filePath);
                try { this.loadFile(filePath); } catch (err) { this.options.reloadError?.(err, filePath); }
            } else if (event === "rename") {
                // "rename" can mean the file was deleted or created
                const fileIndex = this.files.findIndex(i => i._path === filePath);
                if (fileIndex >= 0) {
                    // File was deleted
                    this.options.delete?.(filename, filePath);
                    this.files.splice(fileIndex, 1);
                } else {
                    // File was created
                    this.options.create?.(filename, filePath);
                    try { this.loadFile(filePath); } catch (err) { this.options.loadError?.(err, filePath); }
                }
            }
        });

        this.options.watching?.(this.watcher);
    }

    loadFiles() {
        const files = getFiles(this.directory, {
            depth: this.options.depth
        });

        for (const filePath of files) {
            try {
                this.loadFile(filePath);
            } catch (err) {
                this.options.loadError?.(err, filePath);
            }
        }

        this.options.loaded?.(this.files);
    }

    loadFile(filePath) {
        if (this.options.fileFilter && !this.options.fileFilter(filePath)) return;

        const oldFileIndex = this.files.findIndex(i => i._path === filePath);
        if (oldFileIndex >= 0) this.files.splice(oldFileIndex, 1);

        const data = fs.readFileSync(filePath, "utf8");
        const parsed = {
            _path: filePath,
            ...(this.options.parser?.(data, filePath) || { data })
        };

        this.files.push(parsed);
        this.options.fileLoaded?.(parsed, filePath);
    }
}

module.exports = DirectoryMonitor;