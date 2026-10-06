import { verifyReadiness } from "../cli/release-readiness.mjs";
import { errorMessage, isDirectRun, repoRoot } from "./common.mjs";
function argument(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
export function verifyReadinessArguments(args: string[]): void {
  const report = verifyReadiness({ root: repoRoot, reportPath: argument(args, "--report"), siteCheckout: argument(args, "--site-checkout") });
  console.log(`Readiness verified: ${report.package}@${report.version}, ${report.fingerprint}, ${report.sites.url}. This does not grant publication permission.`);
}
if (isDirectRun(import.meta.url)) try { verifyReadinessArguments(process.argv.slice(2)); } catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
