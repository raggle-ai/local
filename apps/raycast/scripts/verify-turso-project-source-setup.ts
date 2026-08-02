import assert from "node:assert/strict";
import { needsTursoProjectSourceSetup } from "../src/lib/turso-project-source-setup.ts";

assert.equal(needsTursoProjectSourceSetup({ projectSource: "turso", tursoDatabaseUrl: undefined }), true);
assert.equal(needsTursoProjectSourceSetup({ projectSource: "turso", tursoDatabaseUrl: "   " }), true);
assert.equal(needsTursoProjectSourceSetup({ projectSource: "turso", tursoDatabaseUrl: "libsql://example" }), false);
assert.equal(needsTursoProjectSourceSetup({ projectSource: "json-file", tursoDatabaseUrl: undefined }), false);

console.log("turso project source setup detection verified");
