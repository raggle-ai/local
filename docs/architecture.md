# Architecture

`@raggle-ai/local` keeps the public API in TypeScript and isolates expensive local discovery behind a scanner module.

## Layers

- `src/core`: pure project naming, config normalization, subpath rules, keyword generation, and public types.
- `src/adapters`: Git, GitHub CLI, opencode, filesystem-backed config, and icon discovery.
- `src/cache`: persisted clone-directory repository indexes.
- `src/discovery`: local project loading and folder scanning.

## Discovery Strategy

The default scanner reads `.git/config` and `.git/HEAD` directly before falling back to Git subprocesses. This avoids spawning `git` once per repository for normal clone-directory scans.

Run the scanner benchmark with:

```sh
npm run build
npm run bench
```

## Native Path

`src/discovery/scanner.ts` exposes the Rust scanner through `napi-rs`. Published packages include the native bindings supported by the release workflow.
