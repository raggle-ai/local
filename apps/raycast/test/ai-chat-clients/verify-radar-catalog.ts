import assert from "node:assert/strict";

const expectedSlugs = ["opencode", "codex", "claude", "t3-code", "devin", "pible"] as const;

const aiChatClientTypes = await import("../../src/lib/ai-chat-clients/types.ts");
assert.deepEqual(
  aiChatClientTypes.AI_CHAT_CLIENT_IDS,
  expectedSlugs,
  "AI client values and their TypeScript type should have one source of truth",
);

let radarCatalog: typeof import("../../src/lib/ai-chat-clients/radar-catalog.ts");
try {
  radarCatalog = await import("../../src/lib/ai-chat-clients/radar-catalog.ts");
} catch (error) {
  assert.fail(`Radar catalog loader is not implemented: ${String(error)}`);
}

function application(slug: (typeof expectedSlugs)[number]) {
  return {
    name: slug,
    slug,
    category: "Application" as const,
    homepage: `https://example.com/${slug}`,
    platforms: ["macOS"],
    capabilities: {
      opensProjectFolder: true,
      canResumeProjectSession: slug === "opencode" || slug === "codex",
      canStartNewProjectSession: slug !== "devin",
    },
  };
}

const liveResponse = {
  collections: {
    applications: [application("pible"), { ...application("codex"), slug: "not-an-ai-client" }, ...expectedSlugs.map(application)],
  },
};

const parsed = radarCatalog.parseRadarApplications(liveResponse, expectedSlugs);
assert.deepEqual(
  parsed.map((item) => item.slug),
  expectedSlugs,
  "applications should be filtered and returned in the requested order",
);

assert.throws(
  () =>
    radarCatalog.parseRadarApplications(
      { collections: { applications: expectedSlugs.slice(1).map(application) } },
      expectedSlugs,
    ),
  /missing.*opencode/i,
  "an incomplete live catalog should not silently create a partial registry",
);

let fetchCount = 0;
let cachedResponse: unknown;
const loadLiveCatalog = radarCatalog.createRadarApplicationLoader({
  expectedSlugs,
  fetchCatalog: async () => {
    fetchCount += 1;
    return liveResponse;
  },
  readCache: async () => cachedResponse,
  writeCache: async (value) => {
    cachedResponse = value;
  },
});

const [firstLoad, secondLoad] = await Promise.all([loadLiveCatalog(), loadLiveCatalog()]);
assert.equal(fetchCount, 1, "concurrent callers should share one remote request");
assert.deepEqual(firstLoad, secondLoad);
assert.deepEqual(cachedResponse, liveResponse, "a successful remote response should replace the fallback cache");

const loadWithoutWritableCache = radarCatalog.createRadarApplicationLoader({
  expectedSlugs,
  fetchCatalog: async () => liveResponse,
  readCache: async () => undefined,
  writeCache: async () => {
    throw new Error("storage unavailable");
  },
});

assert.deepEqual(
  (await loadWithoutWritableCache()).map((item) => item.slug),
  expectedSlugs,
  "cache write failures should not discard a valid remote response",
);

const loadCachedCatalog = radarCatalog.createRadarApplicationLoader({
  expectedSlugs,
  fetchCatalog: async () => {
    throw new Error("offline");
  },
  readCache: async () => liveResponse,
  writeCache: async () => undefined,
});

assert.deepEqual(
  (await loadCachedCatalog()).map((item) => item.slug),
  expectedSlugs,
  "the last successful remote response should be usable while offline",
);

const loadInvalidCache = radarCatalog.createRadarApplicationLoader({
  expectedSlugs,
  fetchCatalog: async () => {
    throw new Error("Radar is offline");
  },
  readCache: async () => ({ invalid: true }),
  writeCache: async () => undefined,
});

await assert.rejects(
  loadInvalidCache(),
  /Radar is offline/,
  "an invalid fallback cache should not mask the remote request error",
);

let retryCount = 0;
const loadRetryableCatalog = radarCatalog.createRadarApplicationLoader({
  expectedSlugs,
  fetchCatalog: async () => {
    retryCount += 1;
    if (retryCount === 1) throw new Error("temporary outage");
    return liveResponse;
  },
  readCache: async () => undefined,
  writeCache: async () => undefined,
});

await assert.rejects(loadRetryableCatalog(), /temporary outage/);
assert.deepEqual(
  (await loadRetryableCatalog()).map((item) => item.slug),
  expectedSlugs,
  "a failed first load should not permanently poison later attempts",
);

assert.equal(
  typeof radarCatalog.fetchRadarCatalogWithTimeout,
  "function",
  "the Radar request timeout should be directly testable",
);
await assert.rejects(
  radarCatalog.fetchRadarCatalogWithTimeout(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    5,
  ),
  /timed out/i,
  "remote loading should have a bounded wait",
);

console.log("remote Radar application catalog verified");
