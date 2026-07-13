# Publishing

The package is published from the `raggle-ai/local` repository as `@raggle-ai/local`.

## Local Checks

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:updates
npm run test:project-config
npm run test:public-api
npm run test:pack-consumer
npm run publish:dry-run
```

For a local npm CLI publish, use `npm publish --access public`. Do not pass `--provenance` locally; provenance generation is only supported in the GitHub Actions trusted publishing flow.

## GitHub Actions

Publishing is handled by `.github/workflows/publish.yml` when a GitHub release is published.

Configure npm trusted publishing for this package with:

- Repository: `raggle-ai/local`
- Workflow: `publish.yml`
- Environment: not set

The workflow runs `npm publish --access public --provenance`.
