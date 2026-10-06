# thegoalbuddy website on Sites

The canonical website source lives in `internal/site/` in this repository. Sites hosts a reproducible static export on its assigned Codex subdomain. No custom domain has been purchased; domain purchase and DNS configuration are deferred.

Current website origin: **https://thegoalbuddy.pete-nektarios.chatgpt.site**. Use the exact URL returned by Sites before deployment or final verification. Do not guess a subdomain or retain the former GitHub Pages URL in active metadata. GitHub Pages deployment has been retired.

## Build and export

From a prepared TypeScript development checkout:

```bash
npm run typecheck
npm run check:branding
npm run check:site
npm run build:site
```

`npm run build:site` produces `dist/` from maintained HTML, CSS, assets, and generated browser runtime. The export must contain no goals, npm credentials, tests, development tools, or release evidence. Self-hosted fonts retain their SIL Open Font License files. The marketing website is independent of the loopback goal board; it does not host or store local goal files.

## Sites identity and deployment

Use a dedicated deployment checkout at `/workspace/sites/thegoalbuddy`. It records an export from this repository, not another maintained website implementation. Record the originating thegoalbuddy revision and the export's Sites source commit.

Read `.openai/hosting.json` in that checkout first. Reuse its exact `project_id` when present; otherwise create one Site and persist the returned ID immediately. Its static configuration uses `static.directory: "dist"`. Preserve the chosen audience; new Sites remain owner-private unless the owner explicitly chooses public access.

The hosting workflow uses Sites' supported source helper and version/deployment tools. Keep source credentials in session memory and send them through hidden stdin. Save the exact source version before deploying; retain its project, source commit, version, and deployment IDs. A successful local build is not hosted verification.

Use Sites' returned origin for the canonical URL, Open Graph URL/image, social image, README website link, and package homepage. Rebuild after those changes. Verify the terminal hosted deployment at its literal URL, including assets, metadata, navigation, clipboard success and denial, desktop/mobile layouts, keyboard access, and reduced motion for the intended audience. Required checks that cannot be performed remain explicit blockers before final npm packaging.

## Future custom domain

When the owner purchases a domain, use Sites' supported domain configuration, verify ownership and HTTPS, then update canonical/social metadata and links together. Do not add a GitHub Pages CNAME or use an upstream domain. Hosting a website does not authorize npm publication; that remains the final, explicitly authorized release step.
