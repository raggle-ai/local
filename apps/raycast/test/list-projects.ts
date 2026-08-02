#!/usr/bin/env node

const path = require("node:path");
const {
  readImportedRepositoryRows,
  loadImportedRepositories,
  normalizeRepositoryUrl,
  repositoryName,
} = require("@raggle-ai/local");

function usage() {
  const script = path.relative(process.cwd(), __filename);
  console.error(`Usage: node --experimental-strip-types ${script} <projects-json-file>`);
}

const filePath = process.argv[2];

if (!filePath) {
  usage();
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), filePath);
const rows = readImportedRepositoryRows(resolvedPath);
const repositories = loadImportedRepositories(resolvedPath);

console.log(`Projects: ${resolvedPath}`);
console.log("");

repositories.forEach((repository, index) => {
  const row = rows[index];
  const normalizedUrl = normalizeRepositoryUrl(row.url);
  const derivedName = repositoryName(normalizedUrl);
  const configuredName = typeof row.name === "string" ? row.name.trim() : "";
  const displayName = configuredName || derivedName;

  console.log(`${index + 1}. ${displayName}`);
  console.log(`   url: ${normalizedUrl}`);
  console.log(`   derivedName: ${derivedName}`);
  console.log(`   configuredName: ${configuredName || "<none>"}`);
  console.log(`   hasCustomName: ${repository.hasCustomName ? "yes" : "no"}`);
});
