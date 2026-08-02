# Open Source Code Research: Folder Viewer Apps

## Summary

Short answer: Zettlr is the best open-source app to study or add for viewing individual project folders as document workspaces. It has first-class workspace and file-tree code, is active, cross-platform, and is designed around opening folders. MarkText is a reasonable lighter Markdown editor with a project tree, but is less purpose-built for multi-folder/workspace workflows. Logseq is installed locally and open source, but it expects a graph-style folder, so it is not a good generic folder viewer for arbitrary Raggle project subpaths. QOwnNotes is strong for note folders, but its workflow is more note-database/settings oriented than simple "open this folder".

## Recommended Repositories

| Rank | Repository | Host | Why it matters | Key code examples | Caveats |
| --- | --- | --- | --- | --- | --- |
| 1 | [Zettlr/Zettlr](https://github.com/Zettlr/Zettlr) | GitHub | Best fit for arbitrary local folders: workspaces, recursive folder indexing, file manager tree, Markdown-oriented UI. | [workspace-store.ts](https://github.com/Zettlr/Zettlr/blob/develop/source/pinia/workspace-store.ts), [FileTree.vue](https://github.com/Zettlr/Zettlr/blob/develop/source/win-main/file-manager/FileTree.vue) | Not installed locally right now. GPL-3.0. |
| 2 | [marktext/marktext](https://github.com/marktext/marktext) | GitHub | Lightweight Markdown editor with project tree/sidebar concepts. | [tree.vue](https://github.com/marktext/marktext/blob/develop/packages/desktop/src/renderer/src/components/sideBar/tree.vue), [sideBar components](https://github.com/marktext/marktext/tree/develop/packages/desktop/src/renderer/src/components/sideBar) | Better as a Markdown editor than a workspace browser. Not installed locally. |
| 3 | [pbek/QOwnNotes](https://github.com/pbek/QOwnNotes) | GitHub | Mature native app around plain-text Markdown note folders and subfolders. | [notefoldersettingswidget.cpp](https://github.com/pbek/QOwnNotes/blob/develop/src/widgets/settings/notefoldersettingswidget.cpp), [notesubfoldertree.cpp](https://github.com/pbek/QOwnNotes/blob/develop/src/widgets/notesubfoldertree.cpp) | Folder setup is app-specific; less direct for "open this project folder now." Not installed locally. |
| 4 | [logseq/logseq](https://github.com/logseq/logseq) | GitHub | Installed locally; strong local-folder graph app with Markdown/Org files. | [graph_dir.cljs](https://github.com/logseq/logseq/blob/master/deps/common/src/logseq/common/graph_dir.cljs), [graph-parser test resources](https://github.com/logseq/logseq/tree/master/deps/graph-parser/test/resources/exporter-test-graph) | Best for Logseq graphs, not arbitrary source/project folders. |

## Technology Verification

| Repository | Technology | Evidence | Verified? | Notes |
| --- | --- | --- | --- | --- |
| Zettlr/Zettlr | Folder/workspace model | `workspace-store.ts` manages `openWorkspaces`, recursively reads workspace paths, tracks descriptors, and reacts to filesystem events. | Yes | Strongest evidence for the Raggle "individual folders" use case. |
| Zettlr/Zettlr | Folder tree UI | `FileTree.vue` renders "Files" and "Workspaces" sections and tree items from root descriptors. | Yes | Better fit than Typora/Clearly for browsing a folder. |
| marktext/marktext | Project tree/sidebar | `tree.vue` renders a `projectTree`, folders, files, and an "Open Folder" empty-state action. | Yes | Good lightweight option, but not as workspace-centric as Zettlr. |
| pbek/QOwnNotes | Local note folders | `notefoldersettingswidget.cpp` populates note folders, stores local paths, and supports subfolder visibility. | Yes | Good if the folder is a notes folder. |
| logseq/logseq | Graph folder model | Source tree includes graph directory modules and test graph fixtures with `pages`, `journals`, and `logseq`. | Yes | Requires graph conventions, so it is less generic. |

## README Analysis

### Zettlr/Zettlr

- README claim: "Your One-Stop Publication Workbench."
- What the code confirms: It has a dedicated workspace store and file manager tree for open folders/workspaces.
- Best files to read: `source/pinia/workspace-store.ts`, `source/win-main/file-manager/FileTree.vue`.
- Research value: Highest. This is the app I would add as the better `Documents` default candidate for individual folders.
- Caveats: Not currently installed locally; GPL-3.0.

### marktext/marktext

- README claim: Simple, elegant Markdown editor for macOS, Windows, Linux.
- What the code confirms: It has a project tree with folders/files and an open-folder path through the sidebar.
- Best files to read: `packages/desktop/src/renderer/src/components/sideBar/tree.vue`.
- Research value: Useful secondary option for a lighter Typora-like app.
- Caveats: It is focused on Markdown editing, not folder/workspace management.

### pbek/QOwnNotes

- README claim: Plain-text file notepad and todo-list manager with Markdown support.
- What the code confirms: It manages local note folders and subfolder settings.
- Best files to read: `src/widgets/settings/notefoldersettingswidget.cpp`, `src/widgets/notesubfoldertree.cpp`.
- Research value: Good for Markdown note directories.
- Caveats: More setup/stateful than an "open this folder" launcher.

### logseq/logseq

- README claim: Privacy-first knowledge management and collaboration platform.
- What the code confirms: It is graph-folder oriented with graph directory modules and test graph fixtures.
- Best files to read: `deps/common/src/logseq/common/graph_dir.cljs`, `deps/graph-parser/test/resources/exporter-test-graph`.
- Research value: Good if individual folders are already Logseq graphs.
- Caveats: Poor generic fit for arbitrary project subfolders.

## Local App Check

Installed locally:

- `Logseq.app`
- `Obsidian.app`
- `Bear.app`
- `MacDown.app`
- `Markdown Editor.app`

Not installed locally:

- `Zettlr.app`
- `MarkText.app`
- `QOwnNotes.app`

Non-open-source but practical note: Obsidian is likely the best installed app for opening arbitrary Markdown folders as vaults, but it does not satisfy the open-source criterion.
