# AGENTS.md

## Mission

Raggle is a Raycast extension for managing and executing reusable AI prompts from local files, shell scripts, and remote GitHub repositories. It provides three main commands: `prompts`, `projects`, and `multilinks`.

## Repository Map

```
<repository-root>/apps/raycast/
├── src/
│   ├── prompts.tsx          # Main prompts command (EnhancedList, favorites, remote loading)
│   ├── projects.tsx         # Standard projects command (git repos, cloning, opening)
│   ├── multilinks.tsx       # Open URLs from text files

│   ├── components/          # Shared UI components
│   │   ├── enhanced-list.tsx    # Shared favorites/reordering list component
│   │   ├── local-prompt-list-item.tsx
│   │   └── edit-project-form.tsx
│   ├── hooks/               # React hooks
│   │   └── usePrompts.ts    # Prompts data fetching and state
│   ├── lib/                 # Business logic (Raycast-specific)
│   │   ├── project-store.ts     # Project caching and hydration
│   │   ├── standard-project-loader.ts  # Thin wrapper around @raggle-ai/local
│   │   ├── opencode.ts          # IDE/terminal opening
│   │   └── standard-project-loader.ts  # App composition over package and adapter
│   ├── utils/               # Utilities
│   │   └── remote-prompts.ts    # GitHub remote prompt loading
│   └── config/              # Settings and preferences
├── packages/                # Shared packages
│   ├── plugins/             # Plugin API for project actions
│   └── (shared project search, snapshots, and list ordering live in @raggle-ai/raycast-adapter)
├── docs/                    # Documentation
│   ├── release.md           # Release process guide
│   ├── list-ui.md           # List component docs
│   └── local-prompts-example.md
├── .github/
│   ├── workflows/ci.yml     # GitHub Actions CI
│   └── pull_request_template.md
├── package.json             # Extension manifest and scripts
├── CHANGELOG.md             # Release notes
└── README.md                # User documentation
```

## Execution Rules

- **Never use `git add .` or `git commit -a`**. Always stage files explicitly with `git add -- <path>...`
- **Never run destructive git commands** (push --force, hard reset, rebase -i) unless explicitly requested
- **Follow existing code style**: match indentation, naming, and patterns in surrounding code
- **Make minimal changes**: achieve the goal with the least code change possible
- **Use TypeScript strictly**: no implicit any; run typecheck before committing
- **Keep imports organized**: group by external, internal, then relative paths
- **Preserve existing tests**: don't modify test logic when refactoring

## Standard Workflows

### Development
```bash
npm install
npm run dev          # Start Raycast development mode
```

### Pre-Commit Checklist
Before every commit, you must:

1. **Run quality checks**:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```

2. **Update release bookkeeping for user-visible changes**:
   - Add entry to `CHANGELOG.md` under `[Unreleased]`
   - Update `README.md` if behavior, setup, or shortcuts changed
   - Update `docs/*.md` if component APIs or release process changed

3. **Review versioning**:
   - Check if `package.json` version should bump (see `docs/release.md`)
   - Patch: bug fixes, internal refactors
   - Minor: new features, new settings, command improvements
   - Major: breaking workflow changes

4. **Stage explicitly**:
   ```bash
   git add -- src/file.tsx src/other.ts
   git status --short   # Verify only intended files staged
   ```

### Committing and Pushing
```bash
git status --short                    # Verify staged files
git diff --cached                     # Review changes
git log -5 --oneline                 # Check recent commit style
git commit -m "descriptive message"   # Use natural language
git pull --rebase --autostash        # Sync with remote
git push
git status --short --branch         # Confirm clean push
```

### Release Process
See `docs/release.md` for full details. Key steps:
1. Update `CHANGELOG.md`
2. Bump `package.json` version if releasing
3. Run all checks
4. Merge and tag
5. `npm run publish`

## Quality Gates

All checks must pass before commit:

| Command | Purpose | Must Pass |
|---------|---------|-----------|
| `npm run typecheck` | TypeScript validation | Yes |
| `npm run lint` | ESLint + Prettier | Yes |
| `npm run build` | Raycast extension build | Yes |
| `npm run fix-lint` | Auto-fix lint issues | Run if lint fails |

CI runs these same checks on every PR and push to main.

## Safety Rules

- **Never commit secrets**: no `.env`, `credentials.json`, or API keys
- **Never modify git config** (user.name, user.email)
- **Never skip hooks** with `--no-verify` unless explicitly requested
- **Don't commit broken code**: always run checks first
- **Preserve user data**: don't change localStorage keys without migration plan
- **Don't force push to main**: warn the user if they request it

## Update Protocol

When modifying this AGENTS.md:

1. Scan repository for new patterns, commands, or conventions
2. Update relevant sections with imperative, scannable instructions
3. Keep sections short and actionable
4. Remove outdated advice, don't just append
5. Ensure file paths and commands are current
6. Never include debug output, secrets, or temporary notes

Last updated: 2026-07-13
