#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
function value(flag) {
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv.includes("--help")) {
    console.log("Usage: raggle-herdr-open --cwd PATH --label TEXT [--tab TEXT] [--command TEXT]");
    process.exit(0);
}
const cwd = value("--cwd");
const label = value("--label");
if (!cwd || !label) {
    console.error("--cwd and --label are required");
    process.exit(2);
}
(0, index_1.openHerdrProject)({ cwd, label, tabLabel: value("--tab"), command: value("--command") });
