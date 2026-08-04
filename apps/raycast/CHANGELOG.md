# Changelog

All notable changes to this project will be documented in this file.

This project loosely follows Keep a Changelog and uses semantic versioning as a practical release guide.

## [Unreleased]

- Remove personal and machine-specific defaults from package metadata, database configuration, utilities, and fixtures.
- Replace the last package-level `standardProjectWithKeywords` name with the consumer-neutral `projectWithKeywords` API.
- Fix local development failing to load the native folder scanner from Raycast's bundled extension output.
- Fix local development bundling libsql's native Node driver while retaining lazy `file:` database support for the CLI.
- Move reusable folder-discovery metadata merging and repository parsing into `@raggle-ai/local`, and move Raycast snapshots and list ordering into `@raggle-ai/raycast-adapter`.
- Consume the local workspace packages directly so Raycast development and CI cannot silently use stale published implementations.
- `projects`: honor nested folder `allSubpaths` configs so their direct child folders are searchable.
- `projects`: repository root rows that have subpath children now show a leading star marker so the main repo is easier to distinguish in search results.
- Replace the vendored local-discovery package with the published `@raggle-ai/local` dependency.
- Keep cached project subpaths visible while the local package emits progressive loading updates.
- Update vulnerable transitive dependencies and override esbuild to the patched 0.28.1 release.
- Improve Projects search with reusable indexed search, bounded and incremental ranking, and stronger relevance for exact names, repository names, title prefixes, and repository roots.
- Add a reproducible Projects search benchmark for 100, 1,000, and 10,000 generated results.
- Fix Projects search results becoming stale after clearing one query and typing another.
- Move indexed project search into the reusable `@raggle/project-search` package.
- Reduce Projects search latency by rendering fewer initial matches, compiling queries once, and ranking matches in one pass.

### Added

- `projects`: add a Sync Remote action on `Cmd+Shift+B` for fast-forwarding the selected local repository from its Git remote.
- `projects`: repository `raggle.json` files can set `excludeFolders` to hide selected top-level folders and their subtrees while preserving same-named nested folders elsewhere.
- `projects`: local `raggle.json` files can set `allSubpaths: true` to make every eligible top-level folder searchable without listing each path.
- `projects`: Pible is now available as an AI chat client target for opening project folders.
- `projects`: repository descriptions are now stored from GitHub owner search, editable on project rows, and included in project search keywords.
- `projects`: Open In settings now support multi-app shortcuts for opening project action targets in selected apps.
- `projects`: configured subpath folders can now define local `raggle.json` subpaths that are expanded relative to that folder.
- `projects`: nested folders containing `kennel.json` under configured subpaths or top-level `allSubpath` folders are now treated as all-folder subpath parents.
- `projects`: add `npm run list:project-subpath-markers -- <path>` for inspecting local marker folders and their searchable child folders.
- `projects`: Finder is now available as an Open In target for project folders.
- `projects`: owner search results now show GitHub avatars when listing matching usernames and organizations.
- `projects`: Typora is now available as an Open In target for project folders.
- `projects`: add `Cmd+Option+.` for copying the selected repository URL.
- `projects`: add a shortcuts list on `Cmd+Option+/`.
- `projects`: `@owner` search now keeps stored project owners at the top and adds async GitHub user and organization results below them.
- `projects`: `from:owner` now shows additional GitHub repositories from that owner above stored projects, sorted by most recently updated.
- `projects`: support `from:owner` search qualifiers that filter results to top-level repositories from a GitHub user or organization.
- `projects`: support `@owner` search for showing matching GitHub usernames and organizations before filtering to their projects.
- `projects`: uncloned repositories now show a separate Clone Repository form with a Local Path field for choosing the clone destination.
- `projects`: add `npm run check:project-icons` for verifying folder icon discovery and inherited subpath rendering from specific local paths.
- `projects`: add `npm run check:project-remote` for comparing configured project remotes with the actual local git remote.
- `projects`: use GitHub owner avatars as a fallback project icon when a GitHub-backed project has no local icon file.
- `projects`: local `raggle.json` files can define top-level `ignoredSubpaths` for generated subpath rows in that directory.
- `projects`: local `raggle.json` files can define repository defaults such as `tags`, `folders`, and searchable `subpaths`.
- `projects`: Project Action plugins can export shared `projectConfig` defaults for generated subpath filtering and project path expansion.
- `projects`: AI chat clients now resume the latest project session when available and fall back to a new session.
- `projects`: add `Cmd+N` for opening a new Codex/OpenCode session directly from project actions.
- `projects`: add `Cmd+Shift+C` for copying the selected Open In target's raw deeplink for the project.
- `projects`: add per-repository Individual Project Settings on `Cmd+Option+,` for toggling all-subpath indexing and compact folder names.
- `projects`: extension preferences now mirror the in-command Project Settings fields, including project source, project actions, Turso, and sync options.
- `projects`: Project Settings now supports optional global ignored subpaths for hiding generated subpath search results while defaulting only to `.raggle`.
- `projects`: repository JSON entries can set `allSubpath: true` to make every top-level folder under that repository searchable as a project result.
- `projects`: add an "Add Subpath" action that appends a first-level local folder to the selected repository's subpath parents.
- `projects`: Add Subpath now supports `Cmd+Option+P` and can create a new first-level folder while saving the subpath.
- `projects`: generated subpath rows now have Subpath Settings for making nested child folders searchable without changing the repository-level settings.
- `projects`: project and subpath settings now show the main repository name and icon instead of repeating generated subpath names.
- `projects`: Project Settings now supports selecting multiple Project Actions folders.
- `projects`: Project Settings now includes a Project Actions Folder picker, applying shared action plugins without requiring the projects JSON file to define them.
- `projects`: Project Action plugin actions now appear directly in the selected project row actions as well as in the Project Actions list.
- `projects`: experimental Turso/libSQL project source powered by `@libsql/client`, with connection testing, JSON import/export, cache-backed loading, and Turso-backed add/edit/delete flows.
- `projects`: Project Actions now show a direct pull request viewer when the selected local project branch has an open GitHub pull request.
- `projects`: Project Action plugins can now return `childActions`, allowing grouped actions to open a cleaner sublist from the project actions page.
- `prompts`: new in-command Prompts Settings view on `cmd+shift+,` with multi-folder selection for local prompt sources.
- `projects`: new in-command Project Settings view on `cmd+shift+,` for changing the default `Open In` app and clone starting point without leaving the command.
- `projects`: Project Settings now includes the Projects List File picker alongside Clone Directory and Open In.
- `projects`: Open In settings now support choosing a custom macOS `.app` bundle, allowing apps like OpenChamber to open project folders.
- `projects`: Claude now opens project folders through Claude Code deep links.
- `projects`: AI chat clients now share a typed project-opening contract for existing and new sessions.
- `projects`: T3 Code is now handled as an AI chat client and opens the installed desktop app for project folders.
- `projects`: Devin is now available as an AI chat client target for opening project folders.
- `projects`: folders form field is now a multi-select TagPicker with automatic discovery — folders are discovered from the local project path and presented as selectable tags instead of manual text entry.
- `prompts` and `projects`: new "Move to Bottom" action (`cmd+shift+h`) in item actions — moves a non-favorite item to the bottom of the recent selections list while keeping it searchable.
- `projects`: custom project names via `name` field in import JSON — auto-filled from repository URL and editable via the Edit Repository form (`cmd+shift+e`).
- `test/list-projects.ts` — CLI script to inspect resolved project names from a projects JSON file.
- All commands: new "Open Extension Settings" action with `cmd+shift+,` shortcut — quickly access extension preferences from any command.

### Changed

- `projects`: AI chat client metadata, capabilities, deeplinks, and launch commands now load from the live Raggle Radar catalog with a last-known-good offline cache.
- `projects`: Codex opening now recognizes the new ChatGPT app shell while preserving the legacy Codex app fallback.
- `projects`: local project discovery and expansion logic moved into a standalone `@raggle/raggle-local` package so the same loading pipeline can be consumed by the Raycast extension and by external tools (e.g. the Turso CLI).
- `projects`: Project Settings now opens as a focused settings hub with separate pages for Open In, project source, Project Actions, and Turso configuration.
- `projects`: GitHub repositories without a custom clone path now default to owner-repository folder names to avoid collisions.
- `projects`: Project Actions folders now also discover direct child plugin folders with `index.*` files, so `plugins/example/index.ts` can load without being imported by the root plugin index.
- `projects`: Project Action plugins can now import Raycast-compatible UI primitives from `@raggle/plugins`, with the plugin manager resolving them to Raycast at runtime.
- `projects`: Project Settings no longer exposes device name, sync toggles, or global ignored subpaths; Turso sync now stays enabled by default.
- `projects`: Add New Project now only saves the repository entry; cloning is started separately from the project row actions.
- `projects`: Projects List File is no longer required when Project Source is Turso/libSQL, while JSON import/export still validates it before use.
- `projects`: Turso-backed project loading now renders warm starts from a local row cache and refreshes the remote database in the background.
- `projects`: Project list rows now use composite UI identities so duplicate remotes or worktrees do not collide during progressive loading.
- `projects`: Project Action plugins now receive source-location helpers and expose load diagnostics in the actions list, making local plugin assets and empty action results easier to debug.
- `projects`: local Project Actions imports are resolved before loading, so outside TypeScript plugin folders can use relative modules and installed dependencies without runtime cache resolution failures.
- Centralized `cmd+shift+f` favorite toggle shortcut in `useEnhancedListFavourites` hook — consumers now use `createToggleFavoriteAction()` instead of manually defining the action.

### Fixed

- `projects`: remove the legacy command-level Projects List File preference so Turso users are no longer blocked by Raycast's JSON-file onboarding screen.
- `projects`: OpenCode session reuse now prefers the latest CLI-reported session for the selected project and still falls back to local session discovery if the CLI lookup fails.
- `projects`: keep saved local projects visible when a background Turso refresh fails and report the failure in a Raycast toast.
- Pin `brace-expansion` to 5.0.8 across the dependency tree to address denial-of-service advisories without a breaking ESLint upgrade.
- `projects`: repository display names now remain sourced from Turso or JSON and ignore local `raggle.json` name overrides, preventing names from changing during progressive loading.
- `projects`: Turso-backed project loading no longer crashes when a stale Projects List File preference points at a missing JSON file, and package-based Project Action plugins now fall back to extension resolution in that case.
- `projects`: Git settings now support a clone account, clone actions launch the clone command in the default terminal app, and terminal clone commands switch GitHub CLI to the configured account before cloning.
- `projects`: opening with Turso selected but no database URL now redirects to the Turso Project Settings form instead of showing a startup error.
- `projects`: Turso remote reconciliation no longer rewrites configured GitHub upstream repositories to same-named local forks.
- `projects`: OpenCode remains available in Open In choices even when macOS app detection cannot find an installed bundle, and now uses the bundled OpenCode icon.
- `projects`: repository rows now ignore stale cached display names and old local folder keywords, so a renamed local folder does not override or keep matching the Turso or JSON project name.
- `projects`: bound Add/Edit Repository folder discovery so large local project trees no longer exhaust the Raycast worker heap.
- `projects`: deleting a Turso-backed project now opens a dedicated confirmation view, removes the row from the current UI immediately, and refreshes from the source instead of reusing stale cached rows.
- `projects`: Turso change-log writes now use unique IDs so rapid repeated project updates do not fail with duplicate `changes.id` constraints.
- `projects`: avoid importing Project Action plugins during initial project list loading, reducing JS heap crashes from heavy local plugins.
- `projects`: Turso project rows no longer reuse machine-specific absolute clone paths from the shared database on other devices.
- `projects`: reduce project loading memory spikes when cloning with a custom path or loading multiple Project Action plugins.
- `projects`: Codex now opens a new thread for project folders with no previous session and can reuse sessions from child folders.
- `projects`: reduce project loading memory spikes by batching repository and subpath resolution instead of scanning all projects at once.
- `projects`: generated subpath rows are now searchable by their parent project name and relative folder path, so searching `main` can surface `_main` child projects.
- `projects`: project and subpath settings now refresh the list immediately after saving so all-subpath changes take effect in the current view.
- `projects`: SSH remotes with or without a `git@` user now match the same local clone, fixing all-subpath loading for repositories such as `_main`.
- `projects`: Turso remote reconciliation now soft-deletes stale duplicate rows when the actual local remote already exists.
- `projects`: subpath icon inheritance now ignores stale cached icons for intermediate folders unless those folders have their own local icon file.
- `projects`: stale configured GitHub URLs no longer override an existing local repo's current remote for list accessories, browser actions, or remote-derived icons.
- `projects`: Turso-backed project rows now reconcile stale configured remotes to the actual local git remote during live refreshes.
- `projects`: SSH remotes with explicit ports now render browser URLs without treating the SSH port as the repository owner.
- `projects`: generated subpath and configured folder rows now inherit repository icons instead of parsing icons from each child folder.
- `projects`: `Cmd+R` now reloads project metadata without first resyncing or clearing the selected row's icon.
- `projects`: reduce startup memory pressure by batching repository/subpath progress updates, bounding rendered rows, deferring bulk icon hydration, and only building heavyweight project actions for the selected row.
- `projects`: Project Settings now resolves the local Project Actions file from Raycast's extension assets path instead of `process.cwd()`.
- `projects`: empty project results now keep refresh, add, and Project Settings actions available, including `cmd+shift+,`.
- `projects`: Add/Edit Repository no longer saves or uses per-repository clone paths.
- `projects`: configured subpath folders now appear as project results themselves, with the folder name as the title and no parent-path subtitle.
- `projects`: exact project-title search matches now rank above subpath child routes that only match by parent path.
- `projects`: subpath child projects now use the leaf folder as the title and show the parent subpath as subtitle.
- `projects`: Opening a project in Codex now initializes the folder before resuming the latest thread, so new Codex chats start in the focused project instead of the previously initialized one.
- `projects`: Opening a project in Codex now resumes the most recently updated local session for that folder when one exists, falling back to opening the folder otherwise.
- `projects`: TypeScript Project Action plugins now preserve source-file `import.meta.url` behavior after compilation, fixing local asset lookups that accidentally pointed at the plugin cache.
- `projects`: local Project Actions folders can now import Raggle's bundled plugin API, fixing `Cannot find package '@raggle/plugins'` load failures.
- `projects`: GitHub HTTPS repository clones now try the exact normalized URL before falling back to GitHub CLI, avoiding `gh` protocol/config issues when cloning public repositories.
- Robust GitHub URL normalization now cleans malformed URLs like `ps://github.com/owner/repo` or paths with extra segments — ensures `projects` cloning works even when the stored project URL is corrupted.
- Removed reserved `cmd+,` shortcut from "Open Settings" actions — Raycast reserves this for opening Raycast preferences.
- Restored primary Enter actions in prompts and projects by letting each command render its own list rows instead of wrapping `List.Item` elements inside `EnhancedList`.
- Fixed favorites ordering and pending favorites handling after moving `EnhancedList` to a data hook.
- Fixed dropdown icons in `projects` — Open In selector now displays proper app icons using `fileIcon` for installed apps.
- `projects`: Edit Repository form no longer pre-fills machine-specific absolute repository paths, keeping the project list JSON portable across machines.
- `projects`: Added validation to prevent cloning when `repositoryRoot` resolves to the home directory — shows a clear error message instead of failing with permission denied.
- `projects`: Cloning now validates that the parent directory is creatable before attempting to clone, providing clearer error messages for misconfigured clone destinations.

### Removed

- Removed leftover prompt command modules and local prompt documentation from this Projects-only extension.
- `prompts` and `multilinks` commands moved into separate Raycast extension repositories.
- `create-contact` command and related files removed — eliminates broken TypeScript imports and streamlines the extension to focus on core prompt management functionality.
- `lucky-search` command removed from commands.json — cleans up unused search command configuration.

### Added

- `projects`: add author/owner and repository name search keywords — searching for "email" or "cli" now matches `https://github.com/email-os/cli`.
- Subpath objects now support `path` and `removePathFromName` properties — enables per-subpath name control for projects.
- Release bookkeeping: changelog, release process notes, and pull request template.
