import { relative } from "node:path";

/** Parse JS or Python stack frames into app-relative {file,line,function}; harness (.wce) and node: frames dropped. */
export function parseFrames(stack: string, appRoot: string): Array<{ file: string; line: number; function?: string }> {
  const rel = (f: string) => { const p = f.replace(/^file:\/\//, ""); const nm = p.lastIndexOf("/node_modules/"); return nm >= 0 ? p.slice(nm + 1) : p.startsWith(appRoot) ? relative(appRoot, p) : p; };
  const py = [...stack.matchAll(/File "([^"]+)", line (\d+), in ([\w<>.]+)/g)].map((m) => ({ file: rel(m[1]), line: Number(m[2]), function: m[3] })).reverse();
  const js = [...stack.matchAll(/\n\s+at (?:async )?(?:([^\s(]+) \()?((?:file:\/\/)?\/[^():]+):(\d+):\d+\)?/g)].map((m) => ({ file: rel(m[2]), line: Number(m[3]), function: m[1]?.split(".").pop() }));
  return (py.length ? py : js).filter((f) => !f.file.startsWith(".wce/") && !f.file.includes("/.wce/") && !/^node:/.test(f.file));
}

