import assert from "node:assert/strict";
import { recordRecentSelection, sortNonFavouritesByRecentSelection } from "@raggle-ai/raycast-adapter";

type Item = {
  key: string;
};

const items: Item[] = [{ key: "alpha" }, { key: "beta" }, { key: "gamma" }, { key: "delta" }];

let recentSelections: string[] = [];
recentSelections = recordRecentSelection(recentSelections, "gamma");
recentSelections = recordRecentSelection(recentSelections, "alpha");
recentSelections = recordRecentSelection(recentSelections, "beta");

assert.deepEqual(recentSelections, ["beta", "alpha", "gamma"]);

const ordered = sortNonFavouritesByRecentSelection(items, ["delta"], recentSelections, (item) => item.key).map(
  (item) => item.key,
);

assert.deepEqual(ordered, ["beta", "alpha", "gamma"]);

const reordered = sortNonFavouritesByRecentSelection(
  items,
  ["delta"],
  recordRecentSelection(recentSelections, "gamma"),
  (item) => item.key,
).map((item) => item.key);

assert.deepEqual(reordered, ["gamma", "beta", "alpha"]);

console.log("enhanced-list last-selected ordering verified");
