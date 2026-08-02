import assert from "node:assert/strict";
import type { RadarApplication } from "../../src/lib/ai-chat-clients/types.ts";

let radarTarget: typeof import("../../src/lib/ai-chat-clients/radar-target.ts");
try {
  radarTarget = await import("../../src/lib/ai-chat-clients/radar-target.ts");
} catch (error) {
  assert.fail(`Radar target selection is not implemented: ${String(error)}`);
}

function application(overrides: Partial<RadarApplication>): RadarApplication {
  return {
    name: "Test App",
    slug: "claude",
    category: "Application",
    homepage: "https://example.com",
    platforms: ["macOS"],
    appNames: ["Test App.app"],
    capabilities: {
      opensProjectFolder: true,
      canResumeProjectSession: false,
      canStartNewProjectSession: true,
    },
    ...overrides,
  };
}

const worktree = "/Users/example/Project With Spaces";
const claude = application({
  deeplinks: [
    {
      id: "new-session",
      label: "New session",
      intent: "new-session",
      urlTemplate: "claude://code/new?folder={absolutePath}",
      variables: [{ key: "absolutePath", encoding: "url-component" }],
    },
    {
      id: "fallback",
      label: "CLI bridge",
      intent: "fallback",
      urlTemplate: "claude-cli://open?cwd={absolutePath}",
      variables: [{ key: "absolutePath", encoding: "url-component" }],
    },
  ],
});

assert.deepEqual(radarTarget.radarProjectTarget(claude, { worktree }), {
  type: "deeplink",
  value: "claude://code/new?folder=%2FUsers%2Fexample%2FProject%20With%20Spaces",
  fallbackValue: "claude-cli://open?cwd=%2FUsers%2Fexample%2FProject%20With%20Spaces",
});

const codex = application({
  slug: "codex",
  capabilities: { opensProjectFolder: true, canResumeProjectSession: true, canStartNewProjectSession: true },
  deeplinks: [
    {
      id: "new-session",
      label: "New session",
      intent: "new-session",
      urlTemplate: "codex://threads/new?path={absolutePath}",
      variables: [{ key: "absolutePath", encoding: "url-component" }],
    },
    {
      id: "resume-session",
      label: "Resume session",
      intent: "resume-session",
      urlTemplate: "codex://threads/{sessionId}",
      variables: [{ key: "sessionId", encoding: "none" }],
    },
  ],
});

assert.deepEqual(
  radarTarget.radarProjectTarget(codex, { worktree }, { sessionId: "session-123", worktree: "/real/project" }),
  { type: "deeplink", value: "codex://threads/session-123" },
);
assert.deepEqual(radarTarget.radarProjectTarget(codex, { worktree, mode: "new" }), {
  type: "deeplink",
  value: "codex://threads/new?path=%2FUsers%2Fexample%2FProject%20With%20Spaces",
});

const t3 = application({
  slug: "t3-code",
  capabilities: { opensProjectFolder: true, canResumeProjectSession: false, canStartNewProjectSession: false },
  launchers: [
    {
      id: "open-project",
      label: "Open project",
      kind: "command",
      intent: "open-project",
      urlTemplate: "cd {absolutePath} && t3",
      variables: [{ key: "absolutePath", encoding: "none" }],
    },
  ],
});

assert.deepEqual(radarTarget.radarProjectTarget(t3, { worktree }), {
  type: "folder",
  value: worktree,
  fallbackLauncher: `cd ${worktree} && t3`,
});

console.log("Radar template rendering and target selection verified");
