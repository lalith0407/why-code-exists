// Lists the REAL exports of packages as the app would load them (run with the tsx loader, cwd = app root). Used to derive framework boundary shims.
import { createRequire } from "node:module"; import { pathToFileURL } from "node:url";
const req = createRequire(process.cwd() + "/package.json");
for (const spec of process.argv.slice(2)) {
  let url; try { url = pathToFileURL(req.resolve(spec)).href } catch { try { url = import.meta.resolve(spec, pathToFileURL(process.cwd()+"/x.mjs").href) } catch (e) { console.log(JSON.stringify({spec, error:String(e.message).slice(0,200)})); continue } }
  try { const m = await import(url); const d = m.default; const keys = [...new Set([...Object.keys(m), ...(d && (typeof d === 'object' || typeof d === 'function') ? Object.keys(d) : [])])]; console.log(JSON.stringify({ spec, url, keys })) } catch (e) { console.log(JSON.stringify({ spec, url, error: String(e.message).slice(0,200) })) }
}
