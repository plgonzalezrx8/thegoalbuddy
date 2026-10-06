# thegoalbuddy Release Process

[CHANGELOG.md](../../CHANGELOG.md) is the single running release history. Add new releases at the top; keep this directory for process instructions. Preserve upstream release records and MIT attribution. Describe behavior with anonymized evidence; do not include private client or project names.

Version **0.5.0** is the intended first fork release and remains unpublished. The earlier pre-migration artifact is superseded. TypeScript migration, Constellation Observatory branding, and the website hosted through Sites must be verified before creating the final npm artifact. Publication requires explicit authorization after that artifact passes its checks.

## Account and compatibility

The npm destination is **thegoalbuddy**, owned by [plgonzalezrx8](https://www.npmjs.com/~plgonzalezrx8). Never publish the upstream `goalbuddy` or `goal-maker` packages. Those names remain CLI aliases pointing to the fork's implementation; Claude Code keeps `/goalbuddy`, and the prep skill stays `$goal-prep` or `/goal-prep`.

Before creating the final artifact, verify official-registry account identity and version eligibility. `npm run publish:identity` requires authenticated `npm whoami` of exactly `plgonzalezrx8` for manual publication; an existing package must list that account as maintainer. First publication is accepted only with the correct authenticated account and a structured E404 for the absent package record. npm still decides whether the name can be claimed. Malformed, authentication, and network responses fail closed; a profile link does not prove authentication.

Keep credentials outside the repository and evidence. An `E401`, `E403`, `E404`, or 2FA failure during publication must be investigated as an actual authentication/permission problem before changing versions. Restore authentication for the correct owner, then recheck identity. Do not rerun plain `npm publish` after an auth failure.

## 1. Verify the source and hosted website

From a source checkout with pinned development dependencies (POSIX shell):

```bash
GOALBUDDY_SKIP_POSTINSTALL=1 npm ci
npm run build
npm run typecheck
npm run check
npm run build:site
```

All maintained program code, tests, fixtures, and tools are authored in TypeScript. Installed runtime stays dependency-free and executes generated JavaScript with plain Node. Generated installable files are committed for direct Git plugin installation; source checks reject type errors, stale output, interrupted generation, and canonical/plugin drift.

`npm run check` is the pre-packaging aggregate. It must not invoke npm packing or publication. Complete the required Node/platform and genuine Codex/Claude installation checks, local board and website browser checks, and verification of the intended audience at the literal Sites URL. Record source revision, input hashes, toolchain, host/platform limits, Sites project/version/deployment/source identities, and actual results. See [site hosting](https://github.com/plgonzalezrx8/thegoalbuddy/blob/main/internal/site/DNS.md).

Ask a distinct reviewer to inspect the exact integrated content and evidence. Any later material fix renews affected checks, hashes, and review. Required skipped or unavailable checks remain blockers; old pre-migration passes do not prove the migrated code works.

## 2. Check readiness before packing

The machine-readable readiness report must match the current package/version, exact source inputs, compiler/lockfile, generated output and mirror, runtime/host/browser results, hosted Sites source/version/URL/audience, and independent review. Its exclusions must be explicit. Missing or non-passing required stages, source drift, legacy authored JavaScript, interrupted build state, and mismatched Site evidence fail the gate.

Run the supported gate with the actual report and exported Sites checkout:

```bash
npm run check:readiness -- --report audit/typescript-sites-migration/readiness.json --site-checkout /workspace/sites/thegoalbuddy
```

The required checks are `typecheck`, `generated`, `sourceTests`, `node18`, `node24`, `nativeCodex`, `nativeClaude`, `boardBrowser`, `websiteBrowser`, `hostedSite`, and `independentReview`. Each passing stage needs a nonempty evidence file and its SHA-256. Independent review must have `scope: "final"`; hosted evidence must prove browser success and carry the matching Sites identities. The report also records `schemaVersion: 1`, `package`, `version`, `sourceCommit`, `fingerprint`, and `sites`. A blocked report is retained honestly and must fail the gate.

A field saying `approved` is evidence data, not publication authority. The user must authorize publication separately. Confirm that `package.json`, both native plugin manifest versions, and the intended release tag agree. Check the latest registry record and exact target version with the bounded official-registry guards; an exact version already published is not permission to overwrite it.

## 3. Create and verify one final artifact

Only after the earlier gates pass, build one final npm tarball through the readiness-guarded tooling and run `npm run check:package` against it. Record its path, byte count, file list, and integrity. Inspect full runtime/module completeness, native manifests, canonical/plugin parity, required licenses and documentation, and exclusion of credentials, goals, tests, and private audit files.

Install that same tarball through isolated local/global/npm-exec channels with scripts enabled and clean temporary homes, configuration, and cache. Test installed executable aliases, both-target setup, target selection, doctor, repair/update provenance, goal creation, and board assets. Confirm installed users need neither a TypeScript compiler nor development dependencies. Record platform coverage and gaps honestly.

The supported packaging and test commands are:

```bash
npm run package:release -- --readiness audit/typescript-sites-migration/readiness.json --destination audit/typescript-sites-migration/artifact --site-checkout /workspace/sites/thegoalbuddy
npm run check:package -- --tarball /absolute/path/thegoalbuddy-0.5.0.tgz
```

Packaging writes a `*.pack.json` report with `status: "untested"`. After the exact artifact tests pass without skips, retain their output and create an artifact verification report with its actual test counts, `status: "pass"`, SHA-256, SHA-512 integrity, file count, and current input fingerprint. Do not mark the packaging report as tested merely because creation succeeded.

Do not rebuild or repack after verification. A source change invalidates affected evidence and requires a newly verified artifact. Preserve the final unpublished tarball while waiting for publication authorization.

## 4. Publish only the authorized, verified artifact

After explicit authorization, run the supported `publish:check` with the readiness report and the verified artifact. Directory `prepublishOnly` remains fail-closed. Publishing a tarball can have different lifecycle behavior from publishing a directory; do not assume `npm publish <tarball>` automatically runs the checkout's preflight.

Use `npm run publish:check -- --readiness <report> --artifact <artifact-verification-report> --site-checkout <checkout>` to check the tested artifact. This verifies source and artifact integrity without repacking; it does not publish or supply authorization.

Publish the exact verified tarball under the intended account. Verify registry version, owner, distribution integrity, tags, repository and bins, then perform a truly fresh registry installation with clean cache/configuration. The release is complete only when the registry artifact matches the tested artifact and the fresh-install checks pass.

Website deployment and creating a GitHub release do not themselves authorize npm publication. After publication, update pre-release npm wording and reverify any changed website copy before redeployment.

## Future trusted publishing

First publication may require authenticated maintainer credentials because no owned package record exists yet. Once the package exists under the intended account, configure npm trusted publishing for subsequent releases:

- Publisher: GitHub Actions
- Owner: `plgonzalezrx8`
- Repository: `thegoalbuddy`
- Workflow: `npm-publish.yml`
- Package: `thegoalbuddy`

The proposed workflow is `.github/workflows/npm-publish.yml`. It must consume matching readiness from a documented release input or retained CI artifact tied to the source revision; untracked local evidence is not available on a fresh runner. Keep automatic publication disabled while that transport is incomplete. Preserve owner/maintainer checks, OIDC permissions, release-only triggering, tag/version parity, exact-version duplicate handling, and bounded registry errors.

Trusted publishing requires a supported GitHub-hosted runner and maintained Node/npm with OIDC support. Configure trust through the maintainer's authenticated npm account only when authorized, then verify the relationship. It is account work, not proof conferred by editing a workflow. Successful public trusted publication should include npm provenance; verify the actual registry result.
