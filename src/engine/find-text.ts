/**
 * Resolving a model's find/replace "find" text against the real file (gen-v17).
 * 1. Exact, unique match: used as is.
 * 2. Otherwise a whitespace-normalized line match (each line trimmed, inner runs of whitespace collapsed, blank lines ignored). If it
 *    matches exactly ONE window of consecutive file lines, the file's ACTUAL text for that window is returned and used as the find text
 *    (verified: it occurs exactly once in the file). Nothing but whitespace may differ.
 * 3. Otherwise the nearest actual window (most normalized lines equal) is returned as feedback for the next attempt.
 */
const norm = (l: string) => l.trim().replace(/\s+/g, " ");

export type FindResolution =
  | { kind: "exact"; find: string }
  | { kind: "whitespace_normalized"; find: string }
  | { kind: "none"; count: number; nearest?: string };

export function resolveFind(file: string, find: string): FindResolution {
  const count = find.trim() ? file.split(find).length - 1 : 0;
  if (count === 1) return { kind: "exact", find };
  const want = find.split("\n").map(norm).filter(Boolean);
  if (!want.length) return { kind: "none", count };
  const lines = file.split("\n");
  const idx = lines.map((l, i) => [norm(l), i] as const).filter(([l]) => l);
  const hits: Array<[number, number]> = []; let bestScore = -1; let bestAt: [number, number] | undefined;
  for (let s = 0; s + want.length <= idx.length; s++) {
    let eq = 0; for (let j = 0; j < want.length; j++) if (idx[s + j][0] === want[j]) eq++;
    const span: [number, number] = [idx[s][1], idx[s + want.length - 1][1]];
    if (eq === want.length) hits.push(span);
    if (eq > bestScore) { bestScore = eq; bestAt = span; }
  }
  if (count === 0 && hits.length === 1) {
    const actual = lines.slice(hits[0][0], hits[0][1] + 1).join("\n");
    if (file.split(actual).length - 1 === 1) return { kind: "whitespace_normalized", find: actual };
  }
  const nearest = bestAt && bestScore > 0 ? lines.slice(bestAt[0], bestAt[1] + 1).join("\n") : undefined;
  return { kind: "none", count, nearest };
}
