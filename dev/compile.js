"use strict";

import path from "node:path";
import { spawn } from "node:child_process";

const thisDirPath = import.meta.dirname;
const jsdocPath = path.join("..", "node_modules", "jsdoc", "jsdoc.js");
console.log(jsdocPath);

//documentation generator 
const docGen = spawn("node", [jsdocPath, "--configure", "doc-conf.json", "--verbose"], {"cwd": thisDirPath});

docGen.stdout.on("data", (data) => {
    console.log(`stdout: ${data}`);
});

docGen.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
});

docGen.on("close", (code) => {
    console.log(`child process exited with code ${code}`);
});
