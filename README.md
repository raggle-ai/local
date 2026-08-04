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

Use `projectWithKeywords(project)` when a consumer needs a copy of a canonical project with its searchable keywords populated.

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

Inspect the configuration stored for a repository in the remote Raggle project
database with a GitHub `owner/repository` pair or a full Git remote URL:

```sh
export TURSO_DATABASE_URL="libsql://your-database.turso.io"
export TURSO_AUTH_TOKEN="..."
raggle-local config bakerstreetco/skills
```

The JSON result reports normalized tags, folders, explicit subpaths, and whether
top-level folder discovery is remotely enabled as `allSubpaths`. Set
`TURSO_DATABASE_URL` or pass `--database-url` to select the libSQL database.

## Layout

- `src/core`: pure project naming, config normalization, subpath rules, keywords, and types.
- `src/adapters`: Git, GitHub CLI, opencode, filesystem config, and icon discovery.
- `src/cache`: clone-directory repository indexing.
- `src/discovery`: local project loading and folder scanning.

## Discovery

Repository scanning is asynchronous and runs in a worker thread so recursive
filesystem traversal does not block the caller. Scans default to three directory
levels and 100 repositories; both limits can be overridden. Cancellation returns
the repositories found so far:

```ts
const controller = new AbortController();
const scan = await scanCloneDirectoryRepositories("/Users/you/projects", {
  maxDepth: 4,
  maxRepos: 1_000,
  timeoutMs: 5_000,
  signal: controller.signal,
  onProgress: (repository, count) => console.log(count, repository.worktree),
});

console.log(scan.repositories, scan.warnings, scan.truncated);
```

The scanner recognizes normal clones, Git worktrees, and bare repositories. It
does not follow symlinked directories and skips common dependency, build, cache,
and version-control metadata directories.

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

Folder discovery runs in a Rust `napi-rs` worker and reads `.git/config` and
`.git/HEAD` directly without Git subprocesses. Published packages include native
bindings for Apple Silicon Macs, Intel Macs, and x64 Linux.

A directory containing `kennel.json` is treated as an automatic subpath root: it becomes a project itself and its child folders are included. `loadLocalProjects` accepts `subpathMarkerFiles` to add further marker file names:

```ts
await loadLocalProjects(projects, {
  cloneDirectory,
  subpathMarkerFiles: ["_schema.json"],
});
```

Built-in `kennel.json` markers are discovered wherever subpath scanning already runs (`collapseSubpaths` repositories and configured subpaths). Custom markers additionally trigger root-level discovery for any cloned repository whose root has a project config file, so folders like `clients/` with a `_schema.json` are picked up without listing them in `subpaths`.

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
result list broad and shallow. `"allSubpaths": true` is shorthand for the same
top-level search. Set `"collapseSubpaths": true` to recursively make every
eligible descendant folder searchable. Explicit `subpaths` can still be used
for selective expansion, and nested folder configs apply these settings
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
  { folders: ["team-a"], collapseSubpaths: true },
]);
```

## GitHub Helpers

`githubAuthenticatedAccounts` exposes the configured GitHub CLI accounts, and `githubPullRequestsBrowserUrl` accepts either a single author or a list of authors when building a PR view URL:

```ts
const accounts = await githubAuthenticatedAccounts();
const url = githubPullRequestsBrowserUrl(
  repository,
  accounts.map((account) => account.username),
);
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
