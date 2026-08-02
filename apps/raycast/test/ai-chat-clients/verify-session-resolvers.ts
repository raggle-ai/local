import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const sessionResolvers = await import("../../src/lib/ai-chat-clients/session-resolvers.ts");
assert.equal(
  typeof sessionResolvers.latestCodexSessionForWorktree,
  "function",
  "the Codex resolver should be directly testable",
);
assert.equal(
  typeof sessionResolvers.latestOpencodeSessionIdForWorktree,
  "function",
  "the OpenCode resolver should be directly testable",
);

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "raggle-codex-sessions-"));
const previousCodexHome = process.env.CODEX_HOME;

try {
  const codexHome = path.join(fixtureRoot, "codex");
  const sessionsDir = path.join(codexHome, "sessions", "2026", "07", "10");
  const projectRoot = path.join(fixtureRoot, "project");
  const nestedWorktree = path.join(projectRoot, "packages", "app");
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(nestedWorktree, { recursive: true });
  process.env.CODEX_HOME = codexHome;

  const olderSessionId = "11111111-1111-4111-8111-111111111111";
  const newerSessionId = "22222222-2222-4222-8222-222222222222";
  writeFileSync(
    path.join(codexHome, "session_index.jsonl"),
    [
      JSON.stringify({ id: olderSessionId, updated_at: "2026-07-09T10:00:00.000Z" }),
      "not-json",
      JSON.stringify({ id: newerSessionId, updated_at: "2026-07-10T10:00:00.000Z" }),
    ].join("\n"),
  );
  writeFileSync(
    path.join(sessionsDir, `rollout-${olderSessionId}.jsonl`),
    [
      JSON.stringify({
        type: "session_meta",
        payload: { id: olderSessionId, timestamp: "2026-07-09T09:00:00.000Z", cwd: projectRoot },
      }),
      JSON.stringify({ timestamp: "2026-07-09T10:00:00.000Z" }),
    ].join("\n"),
  );
  writeFileSync(
    path.join(sessionsDir, `rollout-${newerSessionId}.jsonl`),
    [
      JSON.stringify({
        type: "session_meta",
        payload: { id: newerSessionId, timestamp: "2026-07-10T09:00:00.000Z", cwd: nestedWorktree },
      }),
      "malformed-tail-line",
      JSON.stringify({ timestamp: "2026-07-10T11:00:00.000Z" }),
    ].join("\n"),
  );
  writeFileSync(path.join(sessionsDir, "rollout-33333333-3333-4333-8333-333333333333.jsonl"), "not-json\n");

  assert.deepEqual(sessionResolvers.latestCodexSessionForWorktree(projectRoot), {
    sessionId: newerSessionId,
    worktree: realpathSync(projectRoot),
  });
  assert.equal(sessionResolvers.latestCodexSessionForWorktree(path.join(fixtureRoot, "other-project")), undefined);

  const opencodeCliPath = path.join(fixtureRoot, "mock-opencode");
  writeFileSync(
    opencodeCliPath,
    `#!/bin/sh
if [ "$1" = "session" ] && [ "$2" = "list" ] && [ "$3" = "--format" ] && [ "$4" = "json" ]; then
  cat <<'JSON'
[
  {
    "id": "ses-older",
    "updated": 1000,
    "directory": "${projectRoot}"
  },
  {
    "id": "ses-newer",
    "updated": 2000,
    "directory": "${nestedWorktree}"
  },
  {
    "id": "ses-other",
    "updated": 3000,
    "directory": "${path.join(fixtureRoot, "other-project")}"
  }
]
JSON
  exit 0
fi
echo "unexpected args: $*" >&2
exit 1
`,
  );
  chmodSync(opencodeCliPath, 0o755);

  const previousOpencodePath = process.env.OPENCODE_PATH;
  process.env.OPENCODE_PATH = opencodeCliPath;
  try {
    assert.deepEqual(await sessionResolvers.latestOpencodeSessionIdForWorktree(projectRoot), {
      sessionId: "ses-newer",
      worktree: realpathSync(nestedWorktree),
    });
    assert.deepEqual(
      await sessionResolvers.latestOpencodeSessionIdForWorktree(path.join(fixtureRoot, "other-project")),
      {
        sessionId: "ses-other",
        worktree: realpathSync(path.join(fixtureRoot, "other-project")),
      },
    );
  } finally {
    if (previousOpencodePath === undefined) delete process.env.OPENCODE_PATH;
    else process.env.OPENCODE_PATH = previousOpencodePath;
  }
} finally {
  if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = previousCodexHome;
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Codex session resolution verified");
