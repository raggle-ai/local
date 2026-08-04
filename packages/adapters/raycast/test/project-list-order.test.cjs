const assert = require("node:assert/strict");
const test = require("node:test");

const {
  preserveProjectOrder,
  recordRecentSelection,
  resetRecentSelection,
  sortNonFavouritesByRecentSelection,
} = require("../dist/project-list-order");

test("preserves existing project positions while adding and removing projects", () => {
  const current = [{ worktree: "/beta" }, { worktree: "/alpha" }];
  const updated = [{ worktree: "/alpha", updated: true }, { worktree: "/charlie" }];

  assert.deepEqual(preserveProjectOrder(current, updated), [updated[0], updated[1]]);
});

test("orders non-favourites by recent selection", () => {
  const items = [{ key: "alpha" }, { key: "beta" }, { key: "gamma" }, { key: "delta" }];
  let selections = recordRecentSelection([], "gamma");
  selections = recordRecentSelection(selections, "alpha");
  selections = recordRecentSelection(selections, "beta");

  assert.deepEqual(
    sortNonFavouritesByRecentSelection(items, ["delta"], selections, (item) => item.key).map((item) => item.key),
    ["beta", "alpha", "gamma"],
  );
  assert.deepEqual(resetRecentSelection(selections, "alpha"), ["beta", "gamma"]);
});
