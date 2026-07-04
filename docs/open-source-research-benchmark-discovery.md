# Open Source Code Research: Local Git Repo Discovery + Benchmark Harness

Research target: repos similar to `@raggle-ai/local` — i.e. projects that
**discover local Git repositories from the filesystem** (ideally by reading
`.git` directly, without a `git` subprocess) and/or **benchmark that discovery
process** with synthetic fixtures and throughput stats.

## How `raggle-ai/local` was characterized

- `src/discovery/scanner.ts` — `scanCloneDirectoryRepositories()` reads
  `.git/config` (`[remote "origin"] url`) and `.git/HEAD` directly via
  `readFileSync`; resolves `gitdir:` worktree files; no `git` subprocess.
- `src/discovery/load-local-projects.ts` — maps remote project records to
  local clones, resolves subpaths/folders, reports `remoteMismatch`, batches
  resolution, memoizes FS reads per session, emits `[projects] ... ms` phase
  timings.
- `scripts/benchmark-folder-discovery.mjs` — synthetic fixtures
  (`mkdtempSync` + N fake `.git/config`/`HEAD`), warmup + iterations,
  `performance.now()`, `summarize()` (min/median/mean/max),
  `repositoriesPerSecond`, cleanup in `finally`.
- `scripts/benchmark-data-folder-fetch.mjs` — multi-phase per-iteration
  sampling, internal `[projects]` phase capture, JSON report.
- README flags a possible future Rust `napi-rs` scanner if TS is the bottleneck.

## Summary

Short answer: **`stablyai/orca` is the single closest repo** — it is a
TypeScript (MIT, 11.7k stars, active daily) desktop agent app that ships a
near-twin `nested-repo-discovery.ts` (marker-based `.git` detection, no git
subprocess, `maxDepth`/`maxRepos`/`timeoutMs`, `.gitignore` parsing,
`AbortSignal`, `durationMs`) **and** a mature benchmark culture
(`tools/benchmarks/*.mjs`, `config/scripts/*benchmark*.mjs`, CI perf gates,
checked-in `results/*.json`) using the same methodology as raggle's bench
scripts. Study it first for both axes.

For pure **discovery** references: `mabd-dev/reposcan` (Go, `.git` dir or
`gitdir:` file, `SkipDir`, tests) and `rishmadaan/gitstow`
(`discovery.py` + `reconcile()`, structured/flat layouts) are the cleanest
small reads. For the **benchmark-harness pattern** on synthetic fixtures,
`tecnolgd/repoScanner`'s `tests/benchmark.py` is the closest methodological
twin (sandbox build + `perf_counter` + files/sec + `finally` teardown). For
the "no git subprocess, read `.git` directly + rigorous benchmarking" angle
that justifies raggle's possible Rust rewrite, `ahrav/scratch-scanner-rs` is
the best evidence.

## Recommended Repositories

| Rank | Repository | Host | Why it matters | Key code examples | Caveats |
| --- | --- | --- | --- | --- | --- |
| 1 | [stablyai/orca](https://github.com/stablyai/orca) | GitHub | TS, MIT, 11.7k★, active daily. Twin discovery module AND a benchmark culture using raggle's exact methodology. | [`nested-repo-discovery.ts`](https://github.com/stablyai/orca/blob/main/src/main/project-groups/nested-repo-discovery.ts), [`nested-repo-discovery.test.ts`](https://github.com/stablyai/orca/blob/main/src/main/project-groups/nested-repo-discovery.test.ts), [`tools/benchmarks/daemon-coldstart-bench.mjs`](https://github.com/stablyai/orca/blob/main/tools/benchmarks/daemon-coldstart-bench.mjs) | Benchmarks target daemon/terminal perf, not folder discovery directly; discovery is one feature among many in a large Electron app. |
| 2 | [mabd-dev/reposcan](https://github.com/mabd-dev/reposcan) | GitHub | Go, Apache-2.0, 8★. Cleanest small `FindGitRepos` that mirrors raggle's `gitDirectory()` worktree-file handling (`.git` dir OR `.git` file with `gitdir:`), `SkipDir` to avoid descending into nested repos. | [`internal/scan/scan.go`](https://github.com/mabd-dev/reposcan/blob/main/internal/scan/scan.go), [`internal/scan/scan_test.go`](https://github.com/mabd-dev/reposcan/blob/main/internal/scan/scan_test.go) | Go not TS; no synthetic benchmark harness (tests only); reports dirty/unpushed status, not remote-URL normalization. |
| 3 | [rishmadaan/gitstow](https://github.com/rishmadaan/gitstow) | GitHub | Python, MIT. `discover_repos(root, layout)` with structured (`owner/repo`) vs flat layouts + `reconcile()` (matched/orphaned/missing) — same mental model as raggle's `findLocalRepository` + `remoteMismatch`. | [`src/gitstow/core/discovery.py`](https://github.com/rishmadaan/gitstow/blob/main/src/gitstow/core/discovery.py), [`src/gitstow/core/git.py`](https://github.com/rishmadaan/gitstow/blob/main/src/gitstow/core/git.py) | 0★; `get_remote_url` shells out to `git remote get-url origin` (raggle reads `.git/config` directly); no benchmark harness. |
| 4 | [tecnolgd/repoScanner](https://github.com/tecnolgd/repoScanner) | GitHub | Python, MIT. Closest match to raggle's *benchmark methodology*: synthetic sandbox, `time.perf_counter()`, files/sec throughput, `finally` teardown. | [`tests/benchmark.py`](https://github.com/tecnolgd/repoScanner/blob/main/tests/benchmark.py) | 0★; scans files/dependencies, not `.git` repos; single iteration (no median/percentiles); toy-ish wrapper timing. |
| 5 | [ahrav/scratch-scanner-rs](https://github.com/ahrav/scratch-scanner-rs) | GitHub | Rust, MIT. Reads git pack files directly (no libgit2, no `git` CLI) with rigorous benchmarks (cold/warm cache, GiB/s, `perf stat`, comparison table vs TruffleHog/Gitleaks/Kingfisher). Best evidence for raggle's "rewrite hot path in Rust" note. | README benchmark tables, [`tools/bench-compare/results/architecture-comparison.md`](https://github.com/ahrav/scratch-scanner-rs/blob/main/tools/bench-compare/results/architecture-comparison.md) | 2★; scans secrets not repo discovery; benchmark framing is comparative-secret-scanning, not discovery throughput. |
| 6 | [ErickKramer/ripvcs](https://github.com/ErickKramer/ripvcs) | GitHub | Go, MIT, 48★. Multi-repo manager with a README comparison-benchmark table vs `vcstool` (import/log/pull timings). | README benchmark table, [`test/valid_example.repos`](https://github.com/ErickKramer/ripvcs/blob/main/test/valid_example.repos) | Last push 2025-06 (stale ~1yr); benchmark is a one-off README table, not a reusable harness; focuses on bulk git ops, not discovery scanning. |
| 7 | [orf/git-workspace](https://github.com/orf/git-workspace) | GitHub | Rust, MIT, 342★. Workspace manager that clones from providers and lists projects; `git workspace list` feeds fzf project switching — similar product surface to raggle's project list. | [`src/`](https://github.com/orf/git-workspace/tree/main/src) | Discovers from provider APIs, not filesystem scan; no benchmark harness. |

## Technology Verification

| Repository | Technology | Evidence | Verified? | Notes |
| --- | --- | --- | --- | --- |
| stablyai/orca | Marker-based `.git` discovery, no git subprocess | `nested-repo-discovery.ts`: `hasGitMarker()` uses `stat(.git)` + bare-repo `HEAD`/`objects`/`refs`; comment "broad scans should use cheap filesystem markers instead of spawning Git for every candidate directory" | Yes (read source) | Also supports bare repos and an abstracted `NestedRepoScanFilesystem` for SSH parity. |
| stablyai/orca | TS benchmark harness (synthetic fixtures + median + JSON results) | `tools/benchmarks/daemon-coldstart-bench.mjs`: `os.tmpdir()` fixture, `--iterations`, `median()`, writes `results/*.json`, `finally` cleanup | Yes (read source) | Methodology mirrors raggle's `benchmark-folder-discovery.mjs`; applied to daemon cold-start, not folder scan. |
| stablyai/orca | Discovery test fixtures via `mkdtemp` + `mkdir .git` | `nested-repo-discovery.test.ts`: `tempRoot()`, `makeGitRepo()`, `makeBareGitRepo()`, `afterEach` cleanup | Yes (read source) | Same fixture pattern as raggle's bench; plus an in-memory `posixTestFilesystem` for fast tests. |
| mabd-dev/reposcan | `.git` dir or `gitdir:` file detection | `internal/scan/scan.go`: `isGitRepo()` checks `os.Lstat(.git)` dir, else reads file and checks `strings.Contains(..., "gitdir:")`; `SkipDir` on match | Yes (read source) | Logic nearly identical to raggle's `gitDirectory()`; Go `filepath.WalkDir`. |
| rishmadaan/gitstow | `is_git_repo` cheap path check | `core/git.py`: `git_dir = path / ".git"; return git_dir.exists() and (git_dir.is_dir() or git_dir.is_file())` | Yes (read source) | Cheap check, but `get_remote_url` shells out to `git remote get-url origin` (raggle parses `.git/config` directly). |
| rishmadaan/gitstow | disk-vs-store reconcile | `core/discovery.py`: `reconcile()` returns matched/orphaned/missing | Yes (read source) | Conceptually matches raggle's `findLocalRepository` + `remoteMismatch`. |
| tecnolgd/repoScanner | Synthetic sandbox benchmark | `tests/benchmark.py`: `setup_mock_repository()` (2500 files, depth 5), `time.perf_counter()`, `files/sec`, `shutil.rmtree` in `finally` | Yes (read source) | Closest methodological twin to raggle's bench; scans files not `.git`. |
| ahrav/scratch-scanner-rs | No git CLI / no libgit2; reads pack files directly | README: "scanner-rs reads pack files directly with custom pure-Rust parsers — no libgit2, no git CLI subprocess" + benchmark tables | Yes (README + snippets) | Source not line-verified but README evidence is detailed and consistent; relevant to raggle's napi-rs note. |
| ErickKramer/ripvcs | Multi-repo bulk-ops benchmark | README table: `rv` vs `vcs` import/log/pull timings with 8 workers | Yes (README) | One-off table, not a harness; stale repo. |
| orf/git-workspace | Rust workspace manager, `git workspace list` | README subcommands + crates.io listing | Yes (README) | Provider-driven, not filesystem discovery. |
| PlayForm/Summary | Rust parallel git-repo discovery (`rayon`) + benchmark table | README claims "Finds every `.git` folder recursively" + 6-8x speedup table | Partial — code path not located | `src/discover.rs` and tree API 404'd on default branch `Current`; 1★, CC0-1.0 license. Treat as unverified. |
| alimtvnetwork/gitmap-v19 | Go two-pass `.git`/`gitdir:` detection, worker pool, `MaxDepth` | Search snippet of `gitmap/scanner/scanner.go` | Not verified — repo now 404s | Appeared in web search with relevant code, but `gh api` and the HTML page both return 404 now (private/renamed/deleted). Search gap. |

## README Analysis

### stablyai/orca

- README claim: "Orca is the ADE for working with a fleet of parallel agents. Run any coding agent with your own subscription." Desktop + mobile Electron/TS app.
- What the code confirms: A dedicated `nested-repo-discovery.ts` module does
  marker-based `.git` discovery (no git subprocess) with bounds, ignore
  rules, cancellation, and `durationMs`; a rich `tools/benchmarks/` +
  `config/scripts/*benchmark*.mjs` infrastructure uses the same harness
  patterns as raggle; CI perf gates (`.github/workflows/terminal-perf.yml`)
  and checked-in `results/*.json`.
- Best files to read:
  - [`src/main/project-groups/nested-repo-discovery.ts`](https://github.com/stablyai/orca/blob/main/src/main/project-groups/nested-repo-discovery.ts) — the discovery twin.
  - [`src/main/project-groups/nested-repo-discovery.test.ts`](https://github.com/stablyai/orca/blob/main/src/main/project-groups/nested-repo-discovery.test.ts) — synthetic fixture pattern (`mkdtemp`/`makeGitRepo`/`makeBareGitRepo`) + virtual FS.
  - [`tools/benchmarks/daemon-coldstart-bench.mjs`](https://github.com/stablyai/orca/blob/main/tools/benchmarks/daemon-coldstart-bench.mjs) — benchmark methodology twin.
  - [`config/scripts/compare-benchmark-artifacts.mjs`](https://github.com/stablyai/orca/blob/main/config/scripts/compare-benchmark-artifacts.mjs) and [`check-terminal-perf-report-budgets.mjs`](https://github.com/stablyai/orca/blob/main/config/scripts/check-terminal-perf-report-budgets.mjs) — perf gates.
  - PR [#3534](https://github.com/stablyai/orca/pull/3534) — "Prefer shallow repos in nested repo discovery" shows the scanner evolving with regression tests.
- Research value: Highest. Gives raggle a direct, production-grade TS
  reference for bounded shallow-first traversal, `.gitignore`-aware
  discovery, SSH/remote scanner parity, and a benchmark-harness culture that
  raggle's `scripts/benchmark-*.mjs` can grow into (median summaries, JSON
  result artifacts, CI perf budgets).
- Caveats: Orca is a large Electron app; discovery is one feature, not the
  whole product. Its benchmarks target daemon/terminal perf, not folder
  discovery throughput — the *methodology* transfers, the *subject* differs.

### mabd-dev/reposcan

- README claim: "A fast CLI tool to scan your system for Git repositories and report uncommitted files, unpushed commits, and unpulled changes."
- What the code confirms: `FindGitRepos(roots, dirignore)` walks each root
  with `filepath.WalkDir`, detects `.git` dir or `.git` file containing
  `gitdir:`, `SkipDir` on a found repo, dedup, ignore matcher; has
  `scan_test.go`.
- Best files to read:
  - [`internal/scan/scan.go`](https://github.com/mabd-dev/reposcan/blob/main/internal/scan/scan.go) — `isGitRepo` + `FindGitRepos` (the `gitdir:` handling raggle also implements).
  - [`internal/scan/scan_test.go`](https://github.com/mabd-dev/reposcan/blob/main/internal/scan/scan_test.go) — table-driven Go tests.
- Research value: Cleanest small reference for raggle's `gitDirectory()`
  worktree-file handling in a different language; useful if raggle does the
  Rust `napi-rs` rewrite (same two-case `.git` detection + skip-into-repo
  rule).
- Caveats: Go not TS; no synthetic benchmark harness; reports dirty/unpushed
  status rather than remote-URL normalization.

### rishmadaan/gitstow

- README claim: "A git repository library manager — clone, organize, and maintain collections of repos you learn from." Explicitly compares itself to `ghq` and `gita`.
- What the code confirms: `discover_repos(root, layout)` with structured
  (`root/owner/repo/.git`) and flat (`root/repo/.git`) two-level/one-level
  walks; `reconcile()` returns matched/orphaned/missing; `is_git_repo` is a
  cheap `.git` dir-or-file check.
- Best files to read:
  - [`src/gitstow/core/discovery.py`](https://github.com/rishmadaan/gitstow/blob/main/src/gitstow/core/discovery.py)
  - [`src/gitstow/core/git.py`](https://github.com/rishmadaan/gitstow/blob/main/src/gitstow/core/git.py) — note `get_remote_url` shells out to `git remote get-url origin`.
- Research value: Good reference for the structured-vs-flat layout decision
  and the disk-vs-store reconciliation that mirrors raggle's
  `findLocalRepository` + `remoteMismatch`.
- Caveats: 0★; uses `git` subprocess for remote URL (raggle reads `.git/config`
  directly to stay portable); no benchmark harness.

### tecnolgd/repoScanner

- README claim: "A lightweight CLI tool for rapid codebase analysis. Scan files, dependencies, and code metrics with zero configuration." Includes a "Performance & Benchmarking" section.
- What the code confirms: `tests/benchmark.py` builds a deeply nested mock
  codebase (2500 files, depth 5), runs the scanner, times it with
  `time.perf_counter()`, reports files/sec, tears down the sandbox in
  `finally`.
- Best files to read:
  - [`tests/benchmark.py`](https://github.com/tecnolgd/repoScanner/blob/main/tests/benchmark.py) — benchmark-methodology twin.
- Research value: Closest small reference for raggle's
  synthetic-fixture-benchmark pattern in a different language; useful as a
  contrast to raggle's richer `summarize()` (min/median/mean/max) approach.
- Caveats: 0★; scans files/dependencies, not `.git` repos; single iteration
  (no median/percentiles); times a subprocess wrapper so includes process
  spawn overhead.

### ahrav/scratch-scanner-rs

- README claim: "A secret scanner for git repositories and filesystems." Benchmarked against Kingfisher/TruffleHog/Gitleaks across 8 repos, cold/warm cache, 128 configs.
- What the code confirms (from README/snippets): Reads pack files directly
  with pure-Rust parsers (no libgit2, no `git` CLI); zero-copy MIDX index;
  reports GiB/s; ran `perf stat` with 24 counters; publishes a comparison
  table.
- Best files to read:
  - README benchmark tables and the "Git mode vs filesystem mode" analysis.
  - [`tools/bench-compare/results/architecture-comparison.md`](https://github.com/ahrav/scratch-scanner-rs/blob/main/tools/bench-compare/results/architecture-comparison.md) — rigorous benchmark methodology.
- Research value: Best evidence for raggle's README note about a future Rust
  `napi-rs` scanner — shows the "read `.git` directly, no CLI subprocess"
  philosophy taken to its conclusion, and a serious benchmark methodology
  (cold/warm cache, multiple repos, `perf stat`) raggle could aspire to.
- Caveats: 2★; scans secrets, not repo discovery; the rigorous benchmark
  framing is comparative secret-scanning, not discovery throughput.

### ErickKramer/ripvcs

- README claim: "Fast CLI tool for managing multiple Git repositories." A faster `vcstool` alternative using goroutines.
- What the code confirms: README contains a benchmark table comparing `rv`
  vs `vcs` on import/log/pull with 8 workers.
- Best files to read: README benchmark table; `test/valid_example.repos`.
- Research value: Minor — example of benchmarking multi-repo bulk operations
  (import/log/pull) rather than discovery scanning.
- Caveats: Last push 2025-06 (stale ~1 year); benchmark is a one-off README
  table, not a reusable harness; 48★.

### orf/git-workspace

- README claim: "Sync personal and work git repositories from multiple providers." Rust CLI; `git workspace list` feeds fzf.
- What the code confirms: Provider-driven cloning into a managed directory;
  `list` outputs project names; `fetch` runs `git fetch` in parallel.
- Best files to read: `src/` (provider clients, lockfile handling).
- Research value: Tangential — similar product surface (project list +
  quick-switch) but provider-driven, not filesystem-discovery. Useful as a
  contrast for the "where does the project list come from" design choice.
- Caveats: No filesystem discovery scanning; no benchmark harness.

## Search Gaps & Notes

- `PlayForm/Summary` (Rust, rayon-based "discover every `.git` folder" +
  benchmark table) could not be code-verified: `src/discover.rs` and the
  git-trees/contents APIs all 404'd on default branch `Current`. README
  claims are plausible but unverified; included with a caveat. Worth a
  manual retry.
- `alimtvnetwork/gitemap-v19` appeared in web search with highly relevant
  `gitmap/scanner/scanner.go` content (two-pass `.git`/`gitdir:` detection,
  bounded worker pool, `MaxDepth`, sorted output) but the repo now 404s on
  both `gh api` and the HTML page — likely private, renamed, or deleted.
  Treated as a search gap, not a recommendation.
- The **TypeScript + synthetic-fixture + throughput + median/JSON-results**
  combination that raggle uses is common in orca's `tools/benchmarks/` but
  rare as a *standalone* discovery benchmark. Most discovery scanners
  (reposcan, gitstow, gitmap, ripvcs) ship tests, not throughput harnesses.
  The benchmark-harness pattern is more often found in package-manager /
  globber benchmarks (`vltpkg/benchmarks`, `fast-glob`, `fdir`,
  `tinyglobby`) — listed below as adjacent references, not discovery twins.
- Adjacent (not in table, worth a look if the benchmark harness is the
  primary interest): [vltpkg/benchmarks](https://github.com/vltpkg/benchmarks)
  (Node package-manager benchmark fixtures), [bench-node](https://www.npmjs.com/package/bench-node)
  (Node ops/sec harness), [boneskull/modestbench](https://github.com/boneskull/modestbench)
  (TS benchmark runner with warmup/iterations/JSON+CSV).

## Methodology

- Characterized raggle-ai/local from `src/discovery/scanner.ts`,
  `src/discovery/load-local-projects.ts`, and all three
  `scripts/benchmark-*.mjs` files.
- Searched GitHub (`gh search repos`), GitHub code search, and web search
  with queries like "scan local git repositories", "discover local git
  repositories", "node typescript benchmark folder discovery synthetic
  fixtures", "git-workspace / gita / ghq / vcstool", "napi-rs filesystem
  scanner".
- Verified each recommended repo by reading actual source files (raw
  GitHub) and repo metadata via `gh api`. Rejected README-only claims where
  code could not be confirmed (see Search Gaps).
