"use strict";
import path from "node:path";
import * as fs from "node:fs/promises";
import * as zlib from "node:zlib";

import * as esbuild from "esbuild";

const rootPath = path.join(import.meta.dirname, "..");
const pkg = JSON.parse(await fs.readFile(path.join(rootPath, "package.json"), "utf8"));

const conf = {
    "srcDir": path.join(rootPath, "src"),
    "entry": "communicator.js",
    "outDir": path.join(rootPath, "dist"),
    "globalName": "Communicator"
};

const banner = "/*! " + pkg["name"] + " v" + pkg["version"] + " | " + pkg["license"] + " | " + pkg["repository"]["url"] + " */";

// [file name, format, minify]
const outputs = [
    ["communicator.js", "esm", false],      // ES module (import)
    ["communicator.min.js", "esm", true],   // minified ES module (browsers)
    ["communicator.cjs", "cjs", false],     // CommonJS (require)
    ["communicator.iife.min.js", "iife", true]  // classic <script>, sets window.Communicator
];

// bundle the library into one file of the given format
const buildScript = async function(outPath, format, isMinify) {
    const options = {
        "entryPoints": [path.join(conf["srcDir"], conf["entry"])],
        "outfile": outPath,
        "bundle": true,
        "platform": "neutral",
        "format": format,
        "minify": isMinify,
        "sourcemap": isMinify,
        "legalComments": "none",
        "banner": {"js": banner},
        "logLevel": "warning"
    };
    if (format === "iife") {
        // put the class itself on the global object, without the module
        // namespace object (and its helpers) a globalName would wrap it in
        delete options["entryPoints"];
        options["stdin"] = {
            "contents": "import " + conf["globalName"] + " from \"./" + conf["entry"] + "\";\n" +
                "globalThis." + conf["globalName"] + " = " + conf["globalName"] + ";\n",
            "resolveDir": conf["srcDir"],
            "sourcefile": "iife.js"
        };
    }
    await esbuild.build(options);
};

// start from an empty dist so no stale file is left behind
await fs.rm(conf["outDir"], {"recursive": true, "force": true});
await fs.mkdir(conf["outDir"], {"recursive": true});

await Promise.all(outputs.map(function([file, format, isMinify]) {
    return buildScript(path.join(conf["outDir"], file), format, isMinify);
}));

for (const [file] of outputs) {
    const code = await fs.readFile(path.join(conf["outDir"], file));
    const size = (code.byteLength / 1024).toFixed(1);
    const gzip = (zlib.gzipSync(code, {"level": 9}).byteLength / 1024).toFixed(1);
    console.log("  dist/" + file.padEnd(26) + size.padStart(6) + " kB  (gzip " + gzip + " kB)");
}
