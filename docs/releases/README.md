# Release Process

The repository has one canonical, running release history: [CHANGELOG.md](../../CHANGELOG.md). Add every future release to the top of that file. Do not create a separate `docs/releases/<version>.md` file.

This directory contains the release process only. Published GitHub Releases remain immutable public snapshots and should use the matching section of `CHANGELOG.md` as their source copy.

Keep every changelog section and GitHub Release body client-safe. Describe the observed behavior generically and never include client, customer, company, donor, or private project names. Public contributor attribution is allowed.

The fork is configured to publish the `thegoalbuddy` npm package from GitHub Actions using npm trusted publishing. This avoids long-lived npm write tokens and lets npm generate provenance for future releases.

The intended npm account is [plgonzalezrx8](https://www.npmjs.com/~plgonzalezrx8). Publish the new package **thegoalbuddy** under that account; the upstream `goalbuddy` and `goal-maker` packages remain outside this fork's release policy.

`npm run publish:identity` verifies the destination before publication. Manual publishing requires an authenticated `npm whoami` of exactly `plgonzalezrx8`. An existing package must list that account as a maintainer. The trusted-publishing path requires the `plgonzalezrx8/thegoalbuddy` release workflow, GitHub OIDC permission and that same verified npm maintainer. Both `prepublishOnly` and the release workflow enforce the guard. A profile link alone is not authentication.

This source change prepares **0.5.0**, the first fork release; it does not publish the fork or configure npm trust. The prior 0.4.3 history is inherited from upstream. Configure a publisher owned by the fork maintainer before the first release.

## One-Time npm Setup

For a first publication with no existing package record, first prepare and verify the release, then authenticate as `plgonzalezrx8` using npm browser login on the maintainer's computer or a privately configured cloud credential. Run `npm run publish:identity` to verify the account before publication. The guard accepts first publication only with that authenticated account; npm still decides whether the package name can be claimed. A failed registry lookup other than a structured E404 is not treated as an available name.

Once that first publication has created the package under the intended account, configure trusted publishing for subsequent GitHub releases. The trusted workflow deliberately refuses to bootstrap a package with no verified maintainer record.

Configure this on npmjs.com for the `thegoalbuddy` package:

- Publisher: GitHub Actions
- GitHub owner/user: `plgonzalezrx8`
- Repository: `thegoalbuddy`
- Workflow filename: `npm-publish.yml`
- Package: `thegoalbuddy`

The workflow path in this repo is:

```text
.github/workflows/npm-publish.yml
```

Or configure the same trust relationship from the npm CLI:

```bash
npx --yes npm@^11.15.0 trust github thegoalbuddy \
  --repo plgonzalezrx8/thegoalbuddy \
  --file npm-publish.yml \
  --allow-publish \
  --yes
```

This command requires npm owner authentication and may print an `EOTP` browser/OTP URL. Complete that npm authentication step, then rerun the same command if needed. npm `11.15.0` or newer is required for `npm trust`, and `--allow-publish` explicitly limits the relationship to package publishing.

After the trusted publisher works, use npm package settings to require 2FA and disallow tokens for publishing. Do not change upstream package ownership or publication status.

Starting in `0.3.0`, the installer is target-aware: `npx thegoalbuddy` installs into both `~/.codex/` and `~/.claude/`, and `thegoalbuddy update` refreshes both by default. Use `--target codex` or `--target claude` to narrow a command. Both targets share the same `goalbuddy/` skill payload and are exercised by the test suite under `internal/test/`.

## Release Flow

1. Update `package.json` and both plugin manifest versions, then add the new release section to the top of `CHANGELOG.md`.
2. Run local checks:

```bash
npm run publish:check
```

This checks the official-registry npm identity, version eligibility, full tests, canonical/plugin parity, matching package/plugin manifests, and tarball completeness. Direct `npm publish` runs the same preflight through `prepublishOnly`. Run from the complete source checkout; the distributed runtime excludes development tests and is not a release workspace. Test registry overrides cannot authorize a release. A malformed, authentication, or network response fails the gate; only a structured E404 proves no public version record was found.

For independent package checks without authentication, use `npm run check` and `npm run pack:check`. Packed-install smoke tests use isolated homes, npm prefixes/configuration, and real local tarballs. POSIX automation covers local/global npm and installed-bin use; Windows/macOS adoption remains a separate validation requirement.

3. Commit and push the version and changelog changes together.
4. After the first authenticated npm publication and trusted-publisher setup, create and publish a GitHub release whose tag matches the package version, for example `v0.5.0`, using the matching `CHANGELOG.md` section as its release body. The workflow refuses to publish when the release tag and `package.json` version differ. It checks the exact target version, skips an already-published version even if it is not tagged `latest`, and fails on registry errors.
5. Confirm the GitHub Actions workflow `Publish npm package` completed.
6. Verify npm:

```bash
npm view thegoalbuddy name version dist-tags repository bin --json
npx thegoalbuddy --help
npx thegoalbuddy doctor --target codex
npx thegoalbuddy doctor --target claude
```

## Provenance Expectations

npm trusted publishing requires a GitHub-hosted runner, Node `22.14.0` or newer, npm `11.5.1` or newer, and `id-token: write` workflow permission. The release workflow uses Node 24 and grants the OIDC permission required by npm.

When publishing through trusted publishing from this public repo to the public `thegoalbuddy` package, npm should generate provenance automatically. The workflow intentionally runs `npm publish` without `NODE_AUTH_TOKEN`; npm exchanges the GitHub OIDC identity for a short-lived publish credential.

## Compatibility commands

The fork tarball exposes `thegoalbuddy`, `goalbuddy`, and `goal-maker` CLI names pointing to the same implementation. Claude Code keeps `/goalbuddy`; the prep skill remains `$goal-prep` or `/goal-prep`.

The upstream npm packages `goalbuddy` and `goal-maker` belong to their existing owners. This fork does not transfer, deprecate, or republish them. Use the fork package name for updates so users stay on the fork.
