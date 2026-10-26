/**
 * Rebuild the app's source tree from an agent transcript by replaying every edit-tool diff in order.
 * Used when no repo checkout exists: the reconstructed files are the REAL code the agent wrote (not model fakes).
 * Content is passed through scrubText (code-safe) before it is written. Hunks that do not apply are reported, never guessed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scrubText } from "../scrub.js";
import { resolveTranscript } from "../session/claude-code.js";

export interface TreeResult { root: string; files: string[]; applied: number; failed: Array<{ file: string; line: number; reason: string }>; upTo?: number }

const normPath = (p: string) => p.replace(/^\/+/, "").replace(/^workspace\/+/, "").replace(/^\.\//, "");

interface Hunk { oldStart: number; old: string[]; neu: string[] }

export function parseUnified(diff: string): { file?: string; isNew: boolean; hunks: Hunk[] } {
  const lines = diff.split("\n");
  let file: string | undefined, isNew = false;
  const hunks: Hunk[] = [];
  let cur: Hunk | undefined;
  for (const l of lines) {
    if (l.startsWith("--- ")) { isNew = l.includes("/dev/null"); continue; }
    if (l.startsWith("+++ ")) { file = normPath(l.slice(4).replace(/^b\//, "")); continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(l);
    if (h) { cur = { oldStart: Number(h[1]), old: [], neu: [] }; hunks.push(cur); continue; }
    if (!cur) continue;
    if (l.startsWith("\\")) continue;
    const k = l[0], t = l.slice(1);
    if (k === "+") cur.neu.push(t);
    else if (k === "-") cur.old.push(t);
    else if (k === " " || l === "") { cur.old.push(t); cur.neu.push(t); }
  }
  // A trailing empty line from split is not a context line.
  for (const h of hunks) while (h.old.length && h.neu.length && h.old.at(-1) === "" && h.neu.at(-1) === "" ) { h.old.pop(); h.neu.pop(); }
  return { file, isNew, hunks };
}

/** Apply hunks; each hunk's old block must be found exactly (nearest to oldStart). Returns undefined + reason on mismatch. */
export function applyHunks(content: string, hunks: Hunk[]): { text?: string; reason?: string } {
  let lines = content.split("\n");
  for (const h of hunks) {
    if (!h.old.length) { const at = Math.max(0, Math.min(lines.length, h.oldStart)); lines.splice(at, 0, ...h.neu); continue; }
    let best = -1;
    for (let i = 0; i + h.old.length <= lines.length; i++) {
      if (h.old.every((o, j) => lines[i + j] === o) && (best < 0 || Math.abs(i - (h.oldStart - 1)) < Math.abs(best - (h.oldStart - 1)))) best = i;
    }
    if (best < 0) return { reason: `hunk @@ -${h.oldStart} did not match` };
    lines = [...lines.slice(0, best), ...h.neu, ...lines.slice(best + h.old.length)];
  }
  return { text: lines.join("\n") };
}

/** Replay edits from the raw transcript into outDir. `upTo` (transcript line) limits replay, e.g. to the error's version. */
export function reconstructTree(transcript: string, outDir: string, upTo?: number): TreeResult {
  const files = new Map<string, string>();
  const failed: TreeResult["failed"] = [];
  let applied = 0;
  readFileSync(resolveTranscript(transcript), "utf8").split("\n").forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim() || (upTo && line > upTo)) return;
    let o: any; try { o = JSON.parse(raw); } catch { return; }
    if (o.role !== "tool") return;
    // A full read_file of a file the transcript never created (scaffold output) seeds its base content.
    const rf = o.tool_result?.value?.contents, tf = o.tool_args?.target_file;
    if (o.tool_name === "read_file" && typeof rf === "string" && typeof tf === "string" && o.tool_args.offset == null && o.tool_args.limit == null) {
      const f = normPath(tf);
      if (!tf.startsWith("~") && !files.has(f)) files.set(f, rf);
      return;
    }
    const chunks = o.tool_result?.value?.diff?.chunks;
    if (!Array.isArray(chunks)) return;
    for (const c of chunks) {
      if (typeof c?.diffString !== "string") continue;
      const d = parseUnified(c.diffString);
      if (!d.file) continue;
      const base = d.isNew ? "" : files.get(d.file);
      if (base === undefined) { failed.push({ file: d.file, line, reason: "edit to a file not created in the transcript" }); continue; }
      const r = d.isNew ? { text: d.hunks.flatMap((h) => h.neu).join("\n") } : applyHunks(base, d.hunks);
      if (r.text === undefined) { failed.push({ file: d.file, line, reason: r.reason! }); continue; }
      files.set(d.file, r.text); applied++;
    }
  });
  for (const [f, text] of files) {
    const p = join(outDir, f);
    mkdirSync(dirname(p), { recursive: true });
    const clean = scrubText(text).text;
    writeFileSync(p, clean.endsWith("\n") ? clean : clean + "\n");
  }
  return { root: outDir, files: [...files.keys()], applied, failed, upTo };
}
