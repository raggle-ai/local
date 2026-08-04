import assert from "node:assert/strict";
import { preserveProjectOrder } from "@raggle-ai/raycast-adapter";

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

console.log("stable project list ordering verified");
