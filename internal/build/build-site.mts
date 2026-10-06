import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { errorMessage, filesIn, isDirectRun, repoRoot } from "./common.mjs";

export function checkSite(): void {
  const html = readFileSync(join(repoRoot, "internal/site/index.html"), "utf8");
  if (html.includes("THEGOALBUDDY_SITE_URL")) throw new Error("Sites URL has not been assigned; finalize website metadata first.");
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[^\"]*)"/g)) {
    if (!existsSync(join(repoRoot, "internal/site", match[1]!))) throw new Error(`Missing site asset: ${match[1]}`);
  }
  if (!html.includes("thegoalbuddy") || !html.includes("constellation-star.png")) throw new Error("Website branding is incomplete.");
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  if (!readme.includes("thegoalbuddy") || !readme.includes("tolimarchuk")) throw new Error("README branding or attribution is missing.");
  console.log("Website local asset references, product identity and README attribution checked.");
}
export function buildSite(): void {
  checkSite();
  const destination = join(repoRoot, "dist");
  rmSync(destination, { recursive: true, force: true });
  for (const path of filesIn(repoRoot, "internal/site").filter(file => ["internal/site/index.html", "internal/site/styles.css", "internal/site/script.js"].includes(file) || file.startsWith("internal/site/assets/") && !file.endsWith(".html"))) {
    const target = join(destination, path.slice("internal/site/".length));
    mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(repoRoot, path), target);
  }
  console.log("Built static website in dist/ from canonical TypeScript-generated runtime and assets.");
}
if (isDirectRun(import.meta.url)) try { process.argv.includes("--check") ? checkSite() : buildSite(); } catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
