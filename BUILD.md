# Build and release

The complete operational guide is [docs/BUILD-DEPLOY-INSTALL.md](docs/BUILD-DEPLOY-INSTALL.md).

Quick local validation:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm bundle
node apps/cli/dist/index.js --version
```

Push a `v*` tag to trigger `.github/workflows/release.yml`:

```bash
git tag -a v0.1.0 -m "Sentinel v0.1.0"
git push origin v0.1.0
```

The workflow tests the repository, builds Linux/macOS/Windows artifacts, stages the native SQLite runtime, generates SHA-256 checksums and publishes a GitHub Release. The release archive is the supported input for the curl and PowerShell installers.
