# Publishing

The package is published from the `raggle-ai/local` repository as `@raggle-ai/local`.

## Local Checks

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm run publish:dry-run
```

## GitHub Actions

Publishing is handled by `.github/workflows/publish.yml` when a GitHub release is published.

Configure npm trusted publishing for this package with:

- Repository: `raggle-ai/local`
- Workflow: `publish.yml`
- Environment: not set

The workflow runs `npm publish --access public --provenance`.
