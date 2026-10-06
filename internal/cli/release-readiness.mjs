// Generated from internal/cli/release-readiness.mts; do not edit.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { isRecord, parseJson, parsePackage } from "./contracts.mjs";
import { releaseInputFingerprint, sha256, sourceCommit } from "./release-inputs.mjs";
import { verifyPackageContents } from "./check-package.mjs";
export const requiredChecks = ["typecheck", "generated", "sourceTests", "node18", "node24", "nativeCodex", "nativeClaude", "boardBrowser", "websiteBrowser", "hostedSite", "independentReview"];
function text(value, field) {
    if (typeof value !== "string" || !value.trim())
        throw new Error(`Release verification requires ${field}.`);
    return value;
}
function hex(value, field) {
    const result = text(value, field);
    if (!/^[a-f0-9]{64}$/.test(result))
        throw new Error(`Invalid ${field} hash.`);
    return result;
}
function readJson(path) { return parseJson(readFileSync(path, "utf8")); }
function readEvidence(value, root) {
    if (!isRecord(value))
        throw new Error("Readiness requires hashed evidence references.");
    const reference = { path: text(value.path, "evidence path"), sha256: hex(value.sha256, "evidence") };
    const path = isAbsolute(reference.path) ? reference.path : resolve(root, reference.path);
    const bytes = readFileSync(path);
    if (!bytes.length || sha256(bytes) !== reference.sha256)
        throw new Error("Readiness evidence is empty or has changed.");
    return { reference, bytes };
}
function verifyStageEvidence(bytes, stage, fingerprint, commit, root) {
    let envelope;
    try {
        envelope = parseJson(bytes.toString("utf8"));
    }
    catch {
        throw new Error(`Invalid ${stage} stage evidence envelope.`);
    }
    if (!isRecord(envelope) || envelope.schemaVersion !== 1 || envelope.stage !== stage || envelope.status !== "pass"
        || envelope.fingerprint !== fingerprint || envelope.sourceCommit !== commit) {
        throw new Error(`The ${stage} stage evidence envelope is stale, mismatched or non-passing.`);
    }
    if (!Array.isArray(envelope.evidence) || !envelope.evidence.length)
        throw new Error(`The ${stage} stage requires retained child evidence.`);
    for (const child of envelope.evidence)
        readEvidence(child, root);
    if (stage === "independentReview") {
        if (envelope.scope !== "final" || envelope.codeQuality !== "pass" || envelope.specification !== "pass") {
            throw new Error("Final independent review evidence requires passing specification and code quality verdicts.");
        }
        const reviewer = text(envelope.reviewer, "independent review reviewer").trim().toLowerCase();
        const implementer = text(envelope.implementer, "independent review implementer").trim().toLowerCase();
        if (reviewer === implementer)
            throw new Error("Final independent review requires a reviewer distinct from the implementer.");
    }
    return envelope;
}
function sitesBinding(value) {
    if (!isRecord(value) || !["owner-private", "public"].includes(String(value.audience)))
        throw new Error("Invalid Sites identity/audience evidence.");
    const url = text(value.url, "Sites URL");
    let origin;
    try {
        origin = new URL(url);
    }
    catch {
        throw new Error("Invalid Sites URL.");
    }
    if (origin.protocol !== "https:" || !origin.hostname.endsWith(".chatgpt.site") || origin.username || origin.password || origin.search || origin.hash || !["", "/"].includes(origin.pathname))
        throw new Error("Sites URL must be the literal HTTPS Codex subdomain origin.");
    const audience = value.audience;
    if (audience !== "owner-private" && audience !== "public")
        throw new Error("Invalid Sites audience.");
    return { projectId: text(value.projectId, "Sites projectId"), sourceCommit: text(value.sourceCommit, "Sites sourceCommit"), versionId: text(value.versionId, "Sites versionId"), deploymentId: text(value.deploymentId, "Sites deploymentId"), url, audience, websiteFingerprint: hex(value.websiteFingerprint, "websiteFingerprint") };
}
export function verifyReadiness({ root, reportPath, siteCheckout = "/workspace/sites/thegoalbuddy" }) {
    if (!reportPath)
        throw new Error("Release readiness report is required before registry access or packaging.");
    for (const path of [".build/promotion.json", ".build/build.lock"])
        if (existsSync(join(root, path)))
            throw new Error("Unfinished generation transaction blocks release readiness.");
    const pkg = parsePackage(readJson(join(root, "package.json")));
    const raw = readJson(resolve(root, reportPath));
    if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.package !== "thegoalbuddy" || pkg.name !== raw.package || raw.version !== pkg.version)
        throw new Error("Readiness schema/package/version does not match this release.");
    const fingerprint = hex(raw.fingerprint, "fingerprint");
    const commit = text(raw.sourceCommit, "sourceCommit");
    const inputs = releaseInputFingerprint(root);
    if (fingerprint !== inputs.fingerprint || commit !== sourceCommit(root))
        throw new Error("Readiness is stale for the actual checkout inputs or source commit.");
    if (raw.blockers !== undefined && (!Array.isArray(raw.blockers) || raw.blockers.length))
        throw new Error("Unresolved release blockers remain.");
    if (raw.legacySources !== undefined && (!Array.isArray(raw.legacySources) || raw.legacySources.length))
        throw new Error("Legacy authored JavaScript remains.");
    if (!isRecord(raw.checks))
        throw new Error("Readiness checks are missing.");
    const checks = {};
    let hosted;
    for (const name of requiredChecks) {
        const check = raw.checks[name];
        if (!isRecord(check) || check.status !== "pass")
            throw new Error(`Readiness requires passing ${name} verification.`);
        if (name === "independentReview" && check.scope !== "final")
            throw new Error("A preliminary independent review cannot authorize final readiness.");
        const evidence = readEvidence(check.evidence, root);
        const envelope = verifyStageEvidence(evidence.bytes, name, fingerprint, commit, root);
        checks[name] = { status: "pass", evidence: evidence.reference, ...(name === "independentReview" ? { scope: "final" } : {}) };
        if (name === "hostedSite") {
            hosted = envelope;
            if (!isRecord(hosted) || hosted.status !== "pass" || hosted.browserStatus !== "pass")
                throw new Error("Hosted Sites browser verification has not passed.");
        }
    }
    // Populate the complete typed mapping only after all required entries passed.
    const complete = {
        typecheck: checks.typecheck, generated: checks.generated, sourceTests: checks.sourceTests, node18: checks.node18, node24: checks.node24, nativeCodex: checks.nativeCodex, nativeClaude: checks.nativeClaude, boardBrowser: checks.boardBrowser, websiteBrowser: checks.websiteBrowser, hostedSite: checks.hostedSite, independentReview: checks.independentReview,
    };
    const sites = sitesBinding(raw.sites);
    if (!isRecord(hosted) || JSON.stringify(sitesBinding(hosted.sites)) !== JSON.stringify(sites))
        throw new Error("Hosted evidence refers to another Sites source/version/deployment/URL/audience.");
    const siteStatus = spawnSync("git", ["status", "--porcelain", "--", ".openai/hosting.json", "source-manifest.json", "site", "dist"], { cwd: siteCheckout, encoding: "utf8", timeout: 10000 });
    if (siteStatus.error || siteStatus.status !== 0 || siteStatus.stdout.trim())
        throw new Error("Sites exported checkout is unfinished or changed after its source commit.");
    const hosting = readJson(join(siteCheckout, ".openai/hosting.json"));
    if (!isRecord(hosting) || hosting.project_id !== sites.projectId || !isRecord(hosting.static) || hosting.static.directory !== "dist")
        throw new Error("Readiness targets the wrong Sites project.");
    if (sourceCommit(siteCheckout) !== sites.sourceCommit)
        throw new Error("Readiness refers to another Sites source commit.");
    const manifest = readJson(join(siteCheckout, "source-manifest.json"));
    if (!isRecord(manifest) || manifest.sourceFingerprint !== sites.websiteFingerprint || !Array.isArray(manifest.files) || !manifest.files.length)
        throw new Error("Sites export manifest/fingerprint is missing or mismatched.");
    const entries = [];
    for (const entry of manifest.files) {
        if (!isRecord(entry) || typeof entry.path !== "string" || !entry.path.startsWith("internal/site/") || entry.path.includes("\\") || entry.path.split("/").some(part => part === ".." || part === ""))
            throw new Error("Unsafe Sites export manifest path.");
        const digest = hex(entry.sha256, "Sites file");
        if (sha256(readFileSync(join(root, entry.path))) !== digest || sha256(readFileSync(join(siteCheckout, "site", entry.path.slice("internal/site/".length)))) !== digest)
            throw new Error("Sites export is stale for the canonical website source.");
        entries.push({ path: entry.path, sha256: digest });
    }
    const expectedSiteFiles = inputs.files.filter(file => file.path.startsWith("internal/site/") && (!file.path.endsWith("DNS.md") && !file.path.endsWith(".html") || file.path === "internal/site/index.html")).map(file => file.path).sort();
    if (JSON.stringify(entries.map(entry => entry.path).sort()) !== JSON.stringify(expectedSiteFiles))
        throw new Error("Sites manifest omits or adds canonical website export inputs.");
    for (const entry of entries.filter(entry => ["internal/site/index.html", "internal/site/styles.css", "internal/site/script.js"].includes(entry.path) || entry.path.startsWith("internal/site/assets/") && !entry.path.endsWith(".html"))) {
        if (sha256(readFileSync(join(siteCheckout, "dist", entry.path.slice("internal/site/".length)))) !== entry.sha256)
            throw new Error("Deployed Sites dist differs from the verified canonical website.");
    }
    if (new Set(entries.map(entry => entry.path)).size !== entries.length || sha256(JSON.stringify(entries)) !== sites.websiteFingerprint)
        throw new Error("Sites export manifest does not reproduce its fingerprint.");
    if (pkg.version !== raw.version)
        throw new Error("Readiness version mismatch.");
    return { schemaVersion: 1, package: "thegoalbuddy", version: pkg.version, fingerprint, sourceCommit: commit, checks: complete, sites };
}
/** Decode npm's gzip/ustar artifact without invoking npm or relying on system tar. */
export function artifactEntries(tarball) {
    const bytes = gunzipSync(tarball, { maxOutputLength: 128 * 1024 * 1024 });
    const entries = new Map();
    let offset = 0, extendedPath;
    while (offset + 512 <= bytes.length) {
        const header = bytes.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0))
            break;
        const string = (start, length) => header.subarray(start, start + length).toString("utf8").split("\0")[0] || "";
        const checksum = Number.parseInt(string(148, 8).trim(), 8);
        let sum = 0;
        for (let i = 0; i < 512; i++)
            sum += i >= 148 && i < 156 ? 32 : header[i];
        const size = Number.parseInt(string(124, 12).trim() || "0", 8);
        if (checksum !== sum || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.length)
            throw new Error("Malformed release tarball header.");
        const data = bytes.subarray(offset + 512, offset + 512 + size), type = string(156, 1);
        offset += 512 + Math.ceil(size / 512) * 512;
        if (type === "x") {
            let position = 0;
            while (position < data.length) {
                const space = data.indexOf(32, position), count = Number(data.subarray(position, space).toString());
                if (space < position || !Number.isSafeInteger(count) || count <= space - position + 1 || position + count > data.length)
                    throw new Error("Malformed tarball extended header.");
                const field = data.subarray(space + 1, position + count - 1).toString("utf8");
                if (field.startsWith("path="))
                    extendedPath = field.slice(5);
                position += count;
            }
            continue;
        }
        if (type === "5") {
            extendedPath = undefined;
            continue;
        }
        if (type !== "0" && type !== "")
            throw new Error("Unsupported links or entries in release tarball.");
        const prefix = string(345, 155);
        const name = extendedPath || (prefix ? `${prefix}/` : "") + string(0, 100);
        extendedPath = undefined;
        if (!name.startsWith("package/") || name.includes("\\") || name.split("/").some(part => part === ".." || part === ""))
            throw new Error("Unsafe release tarball path.");
        const path = name.slice("package/".length);
        if (entries.has(path) || entries.size >= 20000)
            throw new Error("Duplicate or excessive release tarball files.");
        entries.set(path, data);
    }
    if (!entries.size || !entries.has("package.json"))
        throw new Error("Release tarball has no package manifest.");
    return entries;
}
export function inspectArtifact(root, tarball) {
    const entries = artifactEntries(readFileSync(tarball));
    const pkg = parsePackage(parseJson(entries.get("package.json").toString("utf8")));
    const contents = verifyPackageContents({ root, pack: { name: pkg.name, version: pkg.version, files: [...entries.keys()].map(path => ({ path })) } });
    for (const [path, bytes] of entries)
        if (!readFileSync(join(root, path)).equals(bytes))
            throw new Error(`Tarball differs from verified source: ${path}`);
    return contents;
}
export function verifyTestedArtifact({ root, reportPath, readiness }) {
    if (!reportPath)
        throw new Error("Exact tested artifact report is required before registry access.");
    if (releaseInputFingerprint(root).fingerprint !== readiness.fingerprint || sourceCommit(root) !== readiness.sourceCommit)
        throw new Error("Tested artifact readiness is stale for the actual source inputs.");
    const value = readJson(resolve(root, reportPath));
    if (!isRecord(value) || value.schemaVersion !== 1 || value.package !== readiness.package || value.version !== readiness.version || value.fingerprint !== readiness.fingerprint || value.status !== "pass")
        throw new Error("Tested artifact report is missing or stale for this release.");
    if (!isRecord(value.tests) || !Number.isSafeInteger(value.tests.passed) || Number(value.tests.passed) <= 0 || value.tests.failed !== 0 || value.tests.skipped !== 0)
        throw new Error("Exact artifact tests must pass without failures or skips.");
    const tarball = text(value.tarball, "tarball path");
    if (!isAbsolute(tarball) || statSync(tarball).size > 128 * 1024 * 1024)
        throw new Error("Artifact must be an absolute bounded tarball file.");
    const digest = hex(value.sha256, "artifact"), bytes = readFileSync(tarball);
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    if (sha256(bytes) !== digest || value.integrity !== integrity)
        throw new Error("Tested tarball integrity no longer matches.");
    const contents = inspectArtifact(root, tarball);
    if (value.fileCount !== contents.files)
        throw new Error("Artifact file count does not match the actual tarball.");
    return { contents, report: { schemaVersion: 1, package: "thegoalbuddy", version: readiness.version, fingerprint: readiness.fingerprint, tarball, sha256: digest, integrity, fileCount: contents.files, status: "pass", tests: { passed: Number(value.tests.passed), failed: 0, skipped: 0 } } };
}
