# Architecture

`@raggle-ai/local` keeps the public API in TypeScript and isolates expensive local discovery behind a scanner module.

## Layers

- `src/core`: pure project naming, config normalization, subpath rules, keyword generation, and public types.
- `src/adapters`: Git, GitHub CLI, opencode, filesystem-backed config, and icon discovery.
- `src/cache`: persisted clone-directory indexes and cache hydration.
- `src/discovery`: local project loading and folder scanning.

Root-level modules such as `src/git-repository.ts` are compatibility shims. New implementation code should live in the layer directories.

## Discovery Strategy

The default scanner reads `.git/config` and `.git/HEAD` directly before falling back to Git subprocesses. This avoids spawning `git` once per repository for normal clone-directory scans.

Run the scanner benchmark with:

```sh
npm run build
npm run bench
```

## Native Path

If the TypeScript scanner becomes the measured bottleneck, replace `src/discovery/scanner.ts` with a Rust implementation exposed through `napi-rs`. Keep the TypeScript API unchanged and make native scanning optional so Node consumers still have a portable fallback.
