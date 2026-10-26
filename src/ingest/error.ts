import { readFileSync } from "node:fs";
import { scrubObject } from "../scrub.js";
import type { ProdError } from "../types.js";

export function loadProdError(path: string): ProdError {
  const raw = JSON.parse(readFileSync(path, "utf8")) as ProdError;
  if (!raw.id || !raw.message || !Array.isArray(raw.frames) || raw.frames.length === 0) {
    throw new Error(`Invalid prod error fixture: ${path}`);
  }
  return scrubObject(raw);
}

/** Primary app frame (first non-node_modules frame). */
export function primaryFrame(err: ProdError): { file: string; line: number; function?: string } {
  const frame =
    err.frames.find((f) => !f.file.includes("node_modules") && !f.file.startsWith("node:")) ??
    err.frames[0];
  return { file: frame.file, line: frame.line, function: frame.function };
}
