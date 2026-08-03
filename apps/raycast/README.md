# Raggle Projects for Raycast

Raycast extension for browsing, cloning, and opening project repositories.

## Features

- Load projects from JSON or Turso/libSQL
- Search by project, tag, repository owner, repository name, or latest session
- Clone, favorite, reorder, edit, and open projects
- Open projects in OpenCode, Codex, editors, or terminals
- Expand configured repository subfolders into searchable project rows

## Setup

Requirements: macOS, Raycast, Node.js 20+, and `gh auth login` for GitHub-backed searches.

1. Open the `Projects` command in Raycast.
2. Press `Cmd+Shift+,` to open **Project Settings**.
3. Set the project source, projects file or Turso credentials, clone directory, and **Open In** targets.

### Recommended Hotkey

Bind the Raycast `Projects` command to `Cmd+Option+P`:

1. Open **Raycast Settings** > **Extensions**.
2. Search for `Projects`.
3. Select the Raggle `Projects` command.
4. Click **Record Hotkey** in the **Hotkey** column.
5. Press `Cmd+Option+P`.

## Usage

- Type normally to search projects.
- Use `from:owner` to show repositories from a GitHub user or organization.
- Use `@owner` to search GitHub owners through the authenticated `gh` CLI.
- Use `Cmd+Shift+,` for command settings.
- Use `Cmd+Option+,` for per-project or subpath settings.

Project entries can set `allSubpath: true` to include readable top-level folders as separate searchable rows. Repository-local `raggle.json` files can use `allSubpaths: true` as the equivalent shorthand, or `collapseSubpaths: true` to recursively include every eligible descendant. A cloned repository can also define default searchable folders:

```json
{
  "tags": ["cdp", "baker-street"],
  "subpaths": [
    {
      "path": "connectors",
      "removePathFromName": true
    },
    {
      "path": "projects",
      "removePathFromName": true
    },
    {
      "path": "partners",
      "removePathFromName": true
    }
  ],
  "ignoredSubpaths": ["archive", "tmp"]
}
```

Use `folders` for exact relative folders that should appear as project rows. Use `subpaths` for parent folders whose child folders should become searchable project rows. A configured subpath folder can also define its own `raggle.json`, and its `subpaths` are expanded relative to that folder. Folders containing `kennel.json` under configured subpaths or top-level `allSubpath` folders are also treated as nested all-folder subpaths.
Set `removePathFromName` when child rows should use compact leaf-folder titles while keeping their parent folder visible as row context.

## Shortcuts

| Shortcut                  | Action                             |
| ------------------------- | ---------------------------------- |
| `Cmd+Shift+F`             | Toggle Favorite                    |
| `Cmd+N`                   | Open New Session in Codex/OpenCode |
| `Cmd+Shift+,`             | Project Settings                   |
| `Cmd+Option+,`            | Project Row Settings               |
| `Cmd+Shift+B`             | Sync current branch from remote    |
| Configured shortcut       | Open Project Action in Shortcut App |
| `Cmd+Shift+Arrow Up/Down` | Reorder Favorites                  |
| `Cmd+Shift+O`             | Open in Default App                |

## Development

```bash
npm install
npm run dev
```

Checks:

```bash
npm run typecheck
npm run lint
npm run build
```

See `docs/release.md` for release steps.

## License

MIT
