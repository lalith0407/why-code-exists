// Same resolution rules for ESM (hooks.mjs) and CommonJS require() (Module._resolveFilename), since tsx loads
// TypeScript without "type":"module" as CJS. Rules: boundary stubs for listed bare packages; inferred "@/" app alias.
import { register, createRequire } from "node:module";
register(new URL("./hooks.mjs", import.meta.url));
const Module = createRequire(import.meta.url)("node:module");
const stubs = JSON.parse(process.env.WCE_STUBS || "{}");
const root = process.env.WCE_APP_ROOT;
const alias = process.env.WCE_ALIAS_AT === "1";
const abase = process.env.WCE_ALIAS_BASE ? `/${process.env.WCE_ALIAS_BASE}` : "";
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (Object.hasOwn(stubs, request)) return stubs[request];
  if (alias && root && request.startsWith("@/")) return orig.call(this, `${root}${abase}/${request.slice(2)}`, parent, isMain, options);
  return orig.call(this, request, parent, isMain, options);
};
