import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildProjectSearchIndex,
  parseProjectSearch,
  searchIndexedItems,
  searchProjects,
} from "@raggle-ai/raycast-adapter";
import { type StandardProject } from "../src/lib/standard-project-metadata.ts";

function project(overrides: Partial<StandardProject> & Pick<StandardProject, "name" | "worktree">): StandardProject {
  return {
    id: overrides.worktree,
    remoteUrl: `https://github.com/raggle-ai/${overrides.name}.git`,
    repositoryRoot: overrides.worktree,
    isCloned: true,
    isFavorite: false,
    isSubpathRoot: false,
    relatedIds: [],
    ...overrides,
  } as StandardProject;
}

const projects = [
  project({ name: "Raggle", worktree: "/src/raggle", keywords: ["raggle", "prompts"] }),
  project({
    name: "Raggle Docs",
    worktree: "/src/raggle-docs",
    keywords: ["raggle", "docs"],
    latestSessionTitle: "Improve search guide",
  }),
  project({
    name: "Search Tools",
    worktree: "/src/search-tools",
    remoteUrl: "https://github.com/example/search-tools.git",
    keywords: ["search", "tools"],
  }),
];

const index = buildProjectSearchIndex(projects);

const compiledSearch = parseProjectSearch("  Search-Tools  from:Example ");
assert.equal(compiledSearch.normalizedQuery, "search tools");
assert.equal(compiledSearch.compactQuery, "searchtools");
assert.deepEqual(compiledSearch.queryWords, ["search", "tools"]);

assert.deepEqual(
  searchProjects(index, parseProjectSearch("raggle")).map((item) => item.name),
  ["Raggle", "Raggle Docs"],
);

assert.deepEqual(
  searchProjects(index, parseProjectSearch("improve search")).map((item) => item.name),
  ["Raggle Docs"],
);

assert.deepEqual(
  searchProjects(index, parseProjectSearch("search from:example")).map((item) => item.name),
  ["Search Tools"],
);

let queryReads = 0;
const trackedSearch = new Proxy(parseProjectSearch("search"), {
  get(target, property, receiver) {
    if (property === "query") queryReads += 1;
    return Reflect.get(target, property, receiver);
  },
});
searchProjects(index, trackedSearch);
assert.ok(queryReads <= 1, `compiled project search should not repeatedly read the raw query; read it ${queryReads} times`);

const rankingProjects = [
  project({
    name: "Control Centre",
    worktree: "/src/customer-portal",
    remoteUrl: "https://github.com/example/customer-portal.git",
    keywords: ["control", "centre", "customer", "portal"],
  }),
  project({ name: "Customer Portal Notes", worktree: "/src/customer-portal-notes" }),
  project({ name: "Research Tools", worktree: "/src/research-tools" }),
  project({ name: "Search Guide", worktree: "/src/search-guide" }),
  project({ name: "Dashboard", worktree: "/src/dashboard" }),
  project({
    name: "Dashboard",
    worktree: "/src/dashboard/packages/web",
    repositoryRoot: "/src/dashboard",
    relativePath: "packages/web",
  }),
  project({ name: "Operations", worktree: "/src/operations", latestSessionTitle: "Dashboard review" }),
];
const rankingIndex = buildProjectSearchIndex(rankingProjects);

assert.deepEqual(
  searchProjects(rankingIndex, parseProjectSearch("customer portal")).map((item) => item.name),
  ["Control Centre", "Customer Portal Notes"],
  "an exact repository name should beat a configured title prefix",
);

assert.deepEqual(
  searchProjects(rankingIndex, parseProjectSearch("search")).map((item) => item.name),
  ["Search Guide", "Research Tools"],
  "a title word prefix should beat a mid-word match",
);

assert.deepEqual(
  searchProjects(rankingIndex, parseProjectSearch("dashboard")).map((item) => item.worktree),
  ["/src/dashboard", "/src/dashboard/packages/web", "/src/operations"],
  "exact root titles should beat generated subpaths and session-title matches",
);

console.log("project search index verified");

const entries = [
  { value: "alpha", score: 1 },
  { value: "beta", score: 3 },
  { value: "gamma", score: 2 },
];
const bounded = searchIndexedItems(entries, "a", {
  limit: 2,
  matches: (entry, query) => entry.value.includes(query),
  score: (entry) => entry.score,
  order: (entry) => entries.indexOf(entry),
});

assert.deepEqual(
  bounded.items.map((entry) => entry.value),
  ["beta", "gamma"],
);
assert.equal(bounded.total, 3);
assert.equal(bounded.scanned, 3);

const narrowed = searchIndexedItems(
  entries,
  "al",
  {
    limit: 2,
    matches: (entry, query) => entry.value.includes(query),
    score: (entry) => entry.score,
    order: (entry) => entries.indexOf(entry),
    canNarrow: (previous, next) => next.startsWith(previous),
  },
  bounded.cache,
);

assert.deepEqual(
  narrowed.items.map((entry) => entry.value),
  ["alpha"],
);
assert.equal(narrowed.scanned, 3);

const narrowedAgain = searchIndexedItems(
  entries,
  "alp",
  {
    limit: 2,
    matches: (entry, query) => entry.value.includes(query),
    score: (entry) => entry.score,
    order: (entry) => entries.indexOf(entry),
    canNarrow: (previous, next) => next.startsWith(previous),
  },
  narrowed.cache,
);

assert.equal(narrowedAgain.scanned, 1);

const cleared = searchIndexedItems(
  entries,
  "",
  {
    limit: 2,
    matches: (entry, query) => entry.value.includes(query),
    score: (entry) => entry.score,
    order: (entry) => entries.indexOf(entry),
    canNarrow: (previous, next) => next.startsWith(previous),
  },
  narrowedAgain.cache,
);
const retyped = searchIndexedItems(
  entries,
  "g",
  {
    limit: 2,
    matches: (entry, query) => entry.value.includes(query),
    score: (entry) => entry.score,
    order: (entry) => entries.indexOf(entry),
    canNarrow: (previous, next) => next.startsWith(previous),
  },
  cleared.cache,
);

assert.equal(cleared.total, entries.length);
assert.deepEqual(
  retyped.items.map((entry) => entry.value),
  ["gamma"],
);

const enhancedListSource = readFileSync("src/components/enhanced-list.tsx", "utf8");
const indexedSearchHook = enhancedListSource.slice(
  enhancedListSource.indexOf("export function useIndexedSearch"),
  enhancedListSource.indexOf("export function useSearch"),
);
const indexedSearchMemo = indexedSearchHook.slice(
  indexedSearchHook.indexOf("useMemo"),
  indexedSearchHook.indexOf("useEffect"),
);
assert.ok(!indexedSearchMemo.match(/cacheRef\.current\s*=/), "indexed search must not mutate refs during render");

const projectsSource = readFileSync("src/projects.tsx", "utf8");
assert.match(
  projectsSource,
  /const responsiveSearchProjectRenderLimit = 100;/,
  "active project search should initially render at most 100 non-favorite results",
);

const projectListItemSource = readFileSync("src/components/project-list-item.tsx", "utf8");
assert.ok(
  !projectListItemSource.includes("useAiChatClientRegistry"),
  "each rendered project row should not create its own AI client registry hook",
);

console.log("shared indexed search verified");
