# Release Process

This repository uses a lightweight release flow intended for a small Raycast extension codebase.

## When To Update Release Bookkeeping

Update release bookkeeping when a change is user-visible, affects command behavior, adds or removes preferences, or changes publishing metadata.

Usually skip release bookkeeping for internal refactors, test-only changes, or local development tooling unless those changes affect users or publishing.

## Versioning Guide

Use the `version` field in `package.json` as the release source of truth.

- Patch: bug fixes, polish, or internal changes with no meaningful workflow change.
- Minor: new features, new settings, notable command behavior improvements.
- Major: breaking workflow changes, removed capabilities, or incompatible configuration changes.

## Release Checklist

1. Update `CHANGELOG.md`.
2. Bump `package.json` version if the change is being released.
3. Run checks:

```bash
npm run typecheck
npm run lint
npm run build
```

4. Confirm any user-facing docs that need updates are included.
5. Merge and tag the release if you are using Git tags.
6. Publish the extension:

```bash
npm run publish
```

## Changelog Notes

Prefer short entries grouped under `Added`, `Changed`, and `Fixed`.

When possible, mention the affected command explicitly, for example:

- `projects`: preserve pending favorites while using common list ordering.

## Pull Requests

Before opening or merging a PR, check whether the change should also include:

- a changelog entry
- a version bump
- README or docs updates
- screenshots or notes for changed Raycast UI behavior
