import assert from "node:assert/strict";
import { mergeProgressiveProjectUpdate, preserveProjectOrder } from "../src/lib/stable-project-order.ts";

type Item = { worktree: string; name: string; isCloned: boolean };

const current: Item[] = [
  { worktree: "/beta", name: "Beta", isCloned: false },
  { worktree: "/alpha", name: "Alpha", isCloned: false },
];

const progressivelyHydrated: Item[] = [
  { worktree: "/alpha", name: "Aardvark", isCloned: true },
  { worktree: "/beta", name: "Beta", isCloned: false },
  { worktree: "/charlie", name: "Charlie", isCloned: true },
];

assert.deepEqual(
  preserveProjectOrder(current, progressivelyHydrated).map((item) => item.worktree),
  ["/beta", "/alpha", "/charlie"],
);

assert.deepEqual(
  preserveProjectOrder(current, progressivelyHydrated).find((item) => item.worktree === "/alpha"),
  progressivelyHydrated[0],
);

assert.deepEqual(
  preserveProjectOrder(
    current,
    progressivelyHydrated.filter((item) => item.worktree !== "/beta"),
  ).map((item) => item.worktree),
  ["/alpha", "/charlie"],
);

const warmItems: Item[] = [
  { worktree: "/raggle-local", name: "raggle-local", isCloned: true },
  { worktree: "/local-ai-setup", name: "local-ai-setup", isCloned: true },
  { worktree: "/local-code-review", name: "local-code-review", isCloned: true },
];
const partialRepositoryUpdate: Item[] = [
  { worktree: "/raggle-local", name: "raggle-local", isCloned: true },
  { worktree: "/local-studio", name: "local-studio", isCloned: true },
];

assert.deepEqual(
  mergeProgressiveProjectUpdate(warmItems, partialRepositoryUpdate).map((item) => item.worktree),
  ["/raggle-local", "/local-ai-setup", "/local-code-review", "/local-studio"],
  "partial loader updates must not remove cached subpath results",
);

console.log("stable project list ordering verified");
