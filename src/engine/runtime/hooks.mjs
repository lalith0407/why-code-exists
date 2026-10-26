// Node module resolve hook for running REAL app code in the sandbox (registered after tsx, so it runs first).
// 1. Boundary stubs: a specifier listed in WCE_STUBS (JSON {specifier: absolute file}) resolves to that file.
//    The engine only admits stubs for bare external packages (validated before the run), never for app modules.
// 2. App alias: when the app has no tsconfig "paths", a "@/x" import resolves to <WCE_APP_ROOT>/x (the
//    reconstructed tree lost the scaffold's tsconfig). Recorded in the report as an inferred alias.
import { pathToFileURL } from "node:url";
const stubs = JSON.parse(process.env.WCE_STUBS || "{}");
const root = process.env.WCE_APP_ROOT;
const alias = process.env.WCE_ALIAS_AT === "1";
const abase = process.env.WCE_ALIAS_BASE ? `/${process.env.WCE_ALIAS_BASE}` : "";
export async function resolve(spec, ctx, next) {
  if (Object.hasOwn(stubs, spec)) return { url: pathToFileURL(stubs[spec]).href, shortCircuit: true };
  if (alias && root && spec.startsWith("@/")) return next(pathToFileURL(`${root}${abase}/${spec.slice(2)}`).href, ctx);
  return next(spec, ctx);
}
