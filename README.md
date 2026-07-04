# @raggle-ai/local

Local project discovery and expansion logic for Raggle.

## Install

```sh
npm install @raggle-ai/local
```

You can also install directly from the private GitHub repository:

```sh
npm install github:raggle-ai/local
```

## Usage

```ts
import { loadLocalProjects, scanCloneDirectoryRepositories } from "@raggle-ai/local";
```

The package exposes a TypeScript API and ships compiled CommonJS files in `dist`.

## Layout

- `src/core`: pure project naming, config normalization, subpath rules, keywords, and types.
- `src/adapters`: Git, GitHub CLI, opencode, filesystem config, and icon discovery.
- `src/cache`: clone-directory indexes and cache hydration.
- `src/discovery`: local project loading and folder scanning.

Root-level source files are compatibility shims for the original extracted module paths.

## Discovery

Folder discovery first reads `.git/config` and `.git/HEAD` directly, then falls back to Git subprocesses if needed. This keeps the package portable while leaving a clear replacement point for a future Rust `napi-rs` scanner if benchmarks show TypeScript is the bottleneck.

A directory containing `kennel.json` is treated as an automatic subpath root: it becomes a project itself and its child folders are included. `loadLocalProjects` accepts `subpathMarkerFiles` to add further marker file names:

```ts
await loadLocalProjects(projects, {
  cloneDirectory,
  subpathMarkerFiles: ["_schema.json"],
});
```

Built-in `kennel.json` markers are discovered wherever subpath scanning already runs (`allSubpath` repositories and configured subpaths). Custom markers additionally trigger root-level discovery for any cloned repository whose root has a project config file, so folders like `clients/` with a `_schema.json` are picked up without listing them in `subpaths`.

Repo config is read from `raggle.json` or `index.json` (first existing file wins, in that order). `projectConfigFiles` adds custom names that are checked before the defaults:

```ts
await loadLocalProjects(projects, {
  cloneDirectory,
  projectConfigFiles: ["brain.json"],
});
```

```sh
npm run build
npm run bench
```

## Development

```sh
npm install
npm run typecheck
npm run lint
npm run build
npm run publish:dry-run
```

Publishing is handled from GitHub releases through npm trusted publishing. See `docs/publishing.md`.
