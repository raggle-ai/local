const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("documents the stable CLI contract", () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, "../dist/cli.js"), "--help"], {
    encoding: "utf8",
  });
  assert.match(output, /--cwd PATH --label TEXT/);
});
