# thegoalbuddy site hosting

The fork's static site source is `internal/site`, with deployment defined in `.github/workflows/pages.yml`. No site was deployed as part of the branding change.

The default GitHub Pages URL for this repository, once Pages is enabled and a deployment succeeds, is:

```text
https://plgonzalezrx8.github.io/thegoalbuddy/
```

The upstream `goalbuddy.dev` CNAME has been removed from this fork. Do not publish using that domain unless its owner explicitly transfers it. Choose and verify any new custom domain before adding a new CNAME or changing canonical/social URLs.

## Historical upstream configuration

The following records describe the upstream project, not this fork:

- Repository: `tolimarchuk/goalbuddy`
- Pages build type: GitHub Actions workflow
- Custom domain: `goalbuddy.dev`
- Published artifact path: `internal/site`

Cloudflare is authoritative for `goalbuddy.dev`:

```text
serena.ns.cloudflare.com
will.ns.cloudflare.com
```

Required Cloudflare DNS records for the apex domain:

```text
Type  Name  Content
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
AAAA  @     2606:50c0:8000::153
AAAA  @     2606:50c0:8001::153
AAAA  @     2606:50c0:8002::153
AAAA  @     2606:50c0:8003::153
```

Recommended `www` redirect support:

```text
Type   Name  Content
CNAME  www   tolimarchuk.github.io
```

After DNS resolves, re-check:

```bash
dig goalbuddy.dev +noall +answer -t A
dig goalbuddy.dev +noall +answer -t AAAA
dig www.goalbuddy.dev +nostats +nocomments +nocmd
curl -I https://goalbuddy.dev/
```

Then enforce HTTPS in GitHub Pages once the certificate is issued.
