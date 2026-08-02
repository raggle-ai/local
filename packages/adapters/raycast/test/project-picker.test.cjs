const assert = require("node:assert/strict");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");

function project(id) {
  return {
    id,
    worktree: `/tmp/${id}`,
    name: id,
    remoteUrl: `https://github.com/raggle-ai/${id}`,
    repositoryRoot: `/tmp/${id}`,
    sandboxCount: 0,
    hasIcon: false,
    isSessionOnly: false,
    isFavorite: false,
    relatedIds: [],
    isCloned: true,
  };
}

test("displays the number of projects in the list section", () => {
  const fixtureDirectory = path.join(tmpdir(), `raggle-project-picker-${process.pid}`);
  const snapshotPath = path.join(fixtureDirectory, "snapshot.json");
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify({ items: [project("one"), project("two")] }));

  const List = function List() {};
  List.Item = function Item() {};
  List.Section = function Section() {};
  List.EmptyView = function EmptyView() {};
  const raycastApi = {
    Action: function Action() {},
    ActionPanel: function ActionPanel() {},
    Color: {},
    Icon: {
      Checkmark: "checkmark",
      Folder: "folder",
      MagnifyingGlass: "magnifying-glass",
      Plus: "plus",
      Star: "star",
      Warning: "warning",
    },
    List,
    environment: { supportPath: fixtureDirectory },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => {
    if (request === "@raycast/api") return raycastApi;
    if (request === "react") {
      return {
        useCallback: (callback) => callback,
        useEffect: () => {},
        useMemo: (factory) => factory(),
        useRef: (current) => ({ current }),
        useState: (initial) => [initial, () => {}],
      };
    }
    if (request === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: Symbol.for("fragment") };
    return originalLoad(request, parent, isMain);
  };

  try {
    const { ProjectPicker } = require("../dist");
    const tree = ProjectPicker({ snapshotPath, onSelect: () => {} });
    const fragment = tree.props.children;
    const section = fragment.props.children.find(Boolean);

    assert.equal(section.props.title, "Projects (2)");
    assert.equal(section.props.children.length, 2);
  } finally {
    Module._load = originalLoad;
    rmSync(fixtureDirectory, { recursive: true });
  }
});
