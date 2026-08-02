#!/usr/bin/env node

const assert = require("node:assert/strict");

const { subpathProjectName, subpathContextName, subpathParentDisplayName } = require("@raggle-ai/local");

const parent = {
  name: "_main",
  repositoryRoot: "/Users/andrew/Documents/GitHub/_main",
};

assert.equal(subpathContextName(parent, "raggle/clients"), "_main/raggle/clients");
assert.equal(subpathContextName(parent, "subpaths/raggle/clients"), "_main/raggle/clients");
assert.equal(subpathProjectName("happysoft"), "happysoft");
assert.equal(subpathProjectName("nested/happysoft"), "happysoft");
assert.equal(subpathProjectName("subpaths/raggle/clients/happysoft"), "happysoft");
assert.equal(subpathParentDisplayName("happysoft/flutter"), "happysoft");
assert.equal(subpathParentDisplayName("greece/home-internet-starlinkg-wifi"), "greece");
assert.equal(subpathParentDisplayName("subpaths/raggle/clients/happysoft"), "raggle - clients");

console.log("folder-mapping tests passed");
