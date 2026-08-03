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

The package also exports import-file helpers, project-action config merging, and GitHub CLI helpers used by downstream consumers:

```ts
import {
  githubAuthenticatedAccounts,
  githubPullRequestsBrowserUrl,
  raggleProjectConfigFromProjectActionConfigs,
  readImportedRepositoryPlugins,
} from "@raggle-ai/local";
```

The package exposes a TypeScript API and ships compiled CommonJS files in `dist`.

## CLI

List the identified projects strictly beneath a folder. The folder can be a
repository root, a configured folder inside a repository, or a parent directory
containing repositories:

```sh
raggle-local list --folder /Users/you/projects/main/happysoft
cd /Users/you/projects/main/happysoft && raggle-local list
```

The command writes a JSON array of absolute project-folder paths. It does not
include the selected folder itself. `--folder` is a global option, can appear
before or after the command, and defaults to the current working directory.

## Layout

- `src/core`: pure project naming, config normalization, subpath rules, keywords, and types.
- `src/adapters`: Git, GitHub CLI, opencode, filesystem config, and icon discovery.
- `src/cache`: clone-directory indexes and cache hydration.
- `src/discovery`: local project loading and folder scanning.

Root-level source files are compatibility shims for the original extracted module paths.

## Discovery

### Progressive updates

`loadLocalProjects` can report repository roots and resolved folders before subpath discovery completes. Existing one-argument callbacks continue to work. A second argument identifies whether the list is partial or authoritative:

```ts
const items = await loadLocalProjects(projects, {
  cloneDirectory,
  previousItems,
  onUpdate: (items, update) => {
    console.log(update.phase); // repositories | resolved | subpaths
    console.log(update.authoritative); // true only for the final subpaths phase
  },
});
```

Pass the last complete list as `previousItems` to receive deltas suitable for a warm UI:

```ts
let visibleItems = previousItems;

await loadLocalProjects(projects, {
  cloneDirectory,
  previousItems,
  onUpdate: (_items, update) => {
    visibleItems = applyLocalProjectDelta(visibleItems, update.delta);
  },
});
```

Each delta contains idempotent `upserted` projects. `removedWorktrees` remains empty during partial phases and is populated only by the authoritative final phase. The final callback's `items` array is the same complete result returned by the promise.

Folder discovery first reads `.git/config` and `.git/HEAD` directly, then falls back to Git subprocesses if needed. This keeps the package portable while leaving a clear replacement point for a future Rust `napi-rs` scanner if benchmarks show TypeScript is the bottleneck.

A directory containing `kennel.json` is treated as an automatic subpath root: it becomes a project itself and its child folders are included. `loadLocalProjects` accepts `subpathMarkerFiles` to add further marker file names:

```ts
await loadLocalProjects(projects, {
  cloneDirectory,
  subpathMarkerFiles: ["_schema.json"],
});
```

Built-in `kennel.json` markers are discovered wherever subpath scanning already runs (`allSubpaths` repositories and configured subpaths). Custom markers additionally trigger root-level discovery for any cloned repository whose root has a project config file, so folders like `clients/` with a `_schema.json` are picked up without listing them in `subpaths`.

Repo config is read from `raggle.json` or `index.json` (first existing file wins, in that order). `projectConfigFiles` adds custom names that are checked before the defaults:

```ts
await loadLocalProjects(projects, {
  cloneDirectory,
  projectConfigFiles: ["brain.json"],
});
```

Repository-local config contributes tags, folders, subpaths, and discovery settings. Project names remain sourced from the `RemoteProject` input so progressive updates use one stable name.

Set `"allTopLevelFolders": true` in a repository's `raggle.json` to make every
eligible folder directly below the repository searchable while keeping the
result list broad and shallow. Set `"allSubpaths": true` to recursively make
every eligible descendant folder searchable. Explicit `subpaths` can still be
used for selective expansion, and nested folder configs apply either setting
relative to that folder.
Malformed project config stops discovery with the file path, line, column, and
source location instead of being ignored.
Use `"excludeFolders": ["archive", "private"]` to hide selected repository-root
folders and their complete subtrees. Unlike `ignoredSubpaths`, these names only
match the first folder in a relative project path.

## Import Files

Import files can include a top-level `plugins` array alongside `projects`. `readImportedRepositoryPlugins` resolves relative and home-directory plugin paths for the caller:

```ts
const plugins = readImportedRepositoryPlugins("/path/to/projects.json");
```

## Project Action Config

`raggleProjectConfigFromProjectActionConfigs` converts a list of project action configs into the normalized project-config shape used by discovery:

```ts
const merged = raggleProjectConfigFromProjectActionConfigs([
  { tags: ["shared"], subpaths: ["apps/web"] },
  { folders: ["team-a"], allSubpath: true },
]);
```

## GitHub Helpers

`githubAuthenticatedAccounts` exposes the configured GitHub CLI accounts, and `githubPullRequestsBrowserUrl` accepts either a single author or a list of authors when building a PR view URL:

```ts
const accounts = await githubAuthenticatedAccounts();
const url = githubPullRequestsBrowserUrl(repository, accounts.map((account) => account.username));
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
npm run test:project-config
npm run test:public-api
npm run test:pack-consumer
npm run publish:dry-run
```

Publishing is handled from GitHub releases through npm trusted publishing. See `docs/publishing.md`.

## Sharing Pi traces

This repository can publish reviewed, redacted [Pi coding-agent](https://pi.dev/) sessions to the `raggle/local-pi-sessions` Hugging Face dataset with [`pi-share-hf`](https://github.com/badlogic/pi-share-hf).

Install the local prerequisites once:

```sh
npm install -g pi-share-hf @mariozechner/pi-coding-agent
brew install trufflehog
```

Initialize this repository's local review workspace once:

```sh
pi-share-hf init --repo local-pi-sessions --organization raggle
```

Pi only creates a trace after it is run from this repository. Start a normal session with `pi`, then collect and review it:

```sh
pi
pi-share-hf collect --deny .pi/hf-deny.txt README.md
pi-share-hf list --uploadable
pi-share-hf grep -i 'private|secret|token|password|client|customer'
pi-share-hf upload --dry-run
```

Create `.pi/hf-deny.txt` before collection with one case-sensitive regular expression per line for private project names, clients, people, or topics that must never be published. For known literal secrets not already present in `~/.zshrc`, create `.pi/hf-secrets.txt` with one value per line and add `--secret .pi/hf-secrets.txt` to `collect`. Both files and the generated `.pi/hf-sessions/` workspace are gitignored.

Inspect every uploadable session and any extracted images before publishing. Reject a session with `pi-share-hf reject <session.jsonl>`, then publish the approved set with `pi-share-hf upload`.
