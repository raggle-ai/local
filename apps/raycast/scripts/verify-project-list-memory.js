const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function exportedNumberConstant(source, name) {
  const match = source.match(new RegExp(`export const ${name} = ([0-9_]+);`));
  if (!match) throw new Error(`Could not find ${name}`);
  return Number(match[1].replace(/_/g, ""));
}

function readProjectCountFromSupportFile(filePath) {
  if (!existsSync(filePath)) return undefined;

  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) return parsed.length;

  if (!parsed || typeof parsed !== "object") return undefined;
  if (Array.isArray(parsed.items)) return parsed.items.length;
  if (Array.isArray(parsed.projects)) return parsed.projects.length;

  for (const value of Object.values(parsed)) {
    if (value && typeof value === "object" && Array.isArray(value.rows)) {
      return value.rows.length;
    }
  }

  return undefined;
}

const limitsSource = readFileSync(path.join(__dirname, "../src/lib/project-list-limits.ts"), "utf8");
const initialFavoriteProjectRenderLimit = exportedNumberConstant(limitsSource, "initialFavoriteProjectRenderLimit");
const initialNonFavoriteProjectRenderLimit = exportedNumberConstant(
  limitsSource,
  "initialNonFavoriteProjectRenderLimit",
);
const initialSearchProjectRenderLimit = exportedNumberConstant(limitsSource, "initialSearchProjectRenderLimit");
const projectRenderLimitIncrement = exportedNumberConstant(limitsSource, "projectRenderLimitIncrement");

const simulatedLargeProjectCount = 1_800;

assert.equal(Math.min(simulatedLargeProjectCount, initialFavoriteProjectRenderLimit), initialFavoriteProjectRenderLimit);
assert.equal(
  Math.min(simulatedLargeProjectCount, initialNonFavoriteProjectRenderLimit),
  initialNonFavoriteProjectRenderLimit,
);
assert.equal(Math.min(simulatedLargeProjectCount, initialSearchProjectRenderLimit), initialSearchProjectRenderLimit);
assert.equal(
  Math.min(simulatedLargeProjectCount, initialNonFavoriteProjectRenderLimit + projectRenderLimitIncrement),
  initialNonFavoriteProjectRenderLimit + projectRenderLimitIncrement,
);
assert.equal(Math.min(simulatedLargeProjectCount, simulatedLargeProjectCount + projectRenderLimitIncrement), 1_800);

const supportPath = path.join(os.homedir(), "Library/Application Support/com.raycast.macos/extensions/raggle");
const supportCounts = ["standard-projects-snapshot.json", "standard-projects-turso-rows.json", "projects.json"]
  .map((fileName) => readProjectCountFromSupportFile(path.join(supportPath, fileName)))
  .filter((count) => typeof count === "number");

const largestLocalProjectCount = supportCounts.length ? Math.max(...supportCounts) : 0;
if (largestLocalProjectCount > initialNonFavoriteProjectRenderLimit) {
  assert.equal(
    Math.min(largestLocalProjectCount, initialNonFavoriteProjectRenderLimit),
    initialNonFavoriteProjectRenderLimit,
  );
}

console.log("project list render limits verified");
