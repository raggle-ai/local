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
