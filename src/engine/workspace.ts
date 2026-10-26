/**
 * Real-code workspace for a run (generic, no per-app logic):
 *  - app root: the --repo checkout, or the tree rebuilt from the transcript's own edits (tree.ts);
 *  - JS/TS deps: the app's own package.json installed (npm, --ignore-scripts) into a content-addressed cache and linked;
 *  - database: if the app declares a Prisma schema with a postgresql datasource, a REAL local PostgreSQL database is
 *    created from that schema (prisma db push) and cloned per test. Other databases are reported as unsupported.
 *  - Python: the repo's own virtualenv interpreter when present.
 * Failures throw with the command's output (visible), never fall back to fakes.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface DbInfo { kind: "postgresql"; schema: string; template: string; socketDir: string; port: number; psql: string; bin: string }
export interface AppWorkspace { root: string; origin: "repo" | "transcript_replay"; nodeModules?: string; db?: DbInfo; dbUnsupported?: string; python?: string; aliasAt: boolean; aliasBase?: string; notes: string[]; shims?: import("./frameworks.js").BoundaryShim[] }

function sh(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}): string {
  const r = spawnSync(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, encoding: "utf8", timeout: opts.timeout ?? 600000 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status}): ${(r.stderr || r.stdout || String(r.error ?? "")).slice(-1500)}`);
  return r.stdout;
}

export function pgBin(): string {
  const base = "/usr/lib/postgresql";
  const v = existsSync(base) ? readdirSync(base).sort((a, b) => Number(a) - Number(b)).at(-1) : undefined;
  if (!v) throw new Error("PostgreSQL is not installed (needed to run the app's real database); run scripts/pg-up.sh after installing postgresql");
  return join(base, v, "bin");
}

/** Start (or reuse) the local throwaway cluster via scripts/pg-up.sh. */
export function pgUp(): { port: number; socketDir: string; bin: string } {
  sh(resolve("scripts/pg-up.sh"), []);
  return { port: Number(process.env.WCE_PG_PORT || 54329), socketDir: "/tmp", bin: pgBin() };
}

const DEP_KEYS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

/** Install the app's declared deps into ~/.cache/wce/deps/<hash>; reused across runs. Lifecycle scripts are not run. */
export function installDeps(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = Object.fromEntries(DEP_KEYS.filter((k) => pkg[k] && k !== "peerDependencies").map((k) => [k, pkg[k]]));
  const schemaPath = join(root, "prisma", "schema.prisma");
  const schema = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : "";
  const key = createHash("sha256").update(JSON.stringify(deps) + "\0" + schema).digest("hex").slice(0, 16);
  const dir = join(process.env.WCE_DEP_CACHE || join(homedir(), ".cache", "wce", "deps"), key);
  if (!existsSync(join(dir, ".wce-ok"))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "wce-deps", private: true, ...deps }, null, 2));
    sh("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps"], { cwd: dir, timeout: 900000 });
    if (schema) {
      mkdirSync(join(dir, "prisma"), { recursive: true });
      writeFileSync(join(dir, "prisma", "schema.prisma"), schema);
      sh(join(dir, "node_modules/.bin/prisma"), ["generate", "--schema", "prisma/schema.prisma"], { cwd: dir, env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" } });
    }
    writeFileSync(join(dir, ".wce-ok"), new Date().toISOString());
  }
  return join(dir, "node_modules");
}

/** Prisma datasource provider declared by the schema, if any. */
export function prismaProvider(schema: string): string | undefined {
  const ds = /datasource\s+\w+\s*\{([^}]*)\}/m.exec(schema)?.[1];
  return ds ? /provider\s*=\s*"([^"]+)"/.exec(ds)?.[1] : undefined;
}

export const dbUrl = (db: { port: number; socketDir: string }, name: string) => `postgresql://wce@localhost:${db.port}/${name}?host=${db.socketDir}`;

/** Snapshot function installed in schema wce_meta (not the app schema): every public table as JSON rows. */
const SNAPSHOT_FN = `create schema if not exists wce_meta;
create or replace function wce_meta.snapshot() returns json language plpgsql as $$
declare r record; out jsonb := '{}'; rows jsonb;
begin
  for r in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I t', r.table_name) into rows;
    out := out || jsonb_build_object(r.table_name, rows);
  end loop;
  return out::json;
end $$;`;

function prepareDb(root: string, nodeModules: string): DbInfo {
  const schema = join(root, "prisma", "schema.prisma");
  const pg = pgUp();
  const template = `wce_tpl_${randomBytes(4).toString("hex")}`;
  const psql = join(pg.bin, "psql");
  sh(join(pg.bin, "createdb"), ["-h", pg.socketDir, "-p", String(pg.port), "-U", "wce", template]);
  sh(join(nodeModules, ".bin/prisma"), ["db", "push", "--skip-generate", "--accept-data-loss", "--schema", schema], { cwd: root, env: { ...process.env, DATABASE_URL: dbUrl(pg, template), PRISMA_HIDE_UPDATE_MESSAGE: "1" } });
  sh(psql, ["-h", pg.socketDir, "-p", String(pg.port), "-U", "wce", "-d", template, "-v", "ON_ERROR_STOP=1", "-q", "-c", SNAPSHOT_FN]);
  return { kind: "postgresql", schema, template, socketDir: pg.socketDir, port: pg.port, psql, bin: pg.bin };
}

export function cloneDb(db: DbInfo): string {
  const name = `wce_t_${randomBytes(5).toString("hex")}`;
  sh(join(db.bin, "createdb"), ["-h", db.socketDir, "-p", String(db.port), "-U", "wce", "-T", db.template, name]);
  return name;
}
export function dropDb(db: DbInfo, name: string): void {
  spawnSync(join(db.bin, "dropdb"), ["-h", db.socketDir, "-p", String(db.port), "-U", "wce", "--if-exists", name]);
}

function tsconfigHasPaths(root: string): boolean {
  const p = join(root, "tsconfig.json");
  return existsSync(p) && /"paths"\s*:/.test(readFileSync(p, "utf8"));
}

/** Does any app source import "@/..."? (used only when tsconfig paths are absent) */
function usesAtAlias(root: string): boolean {
  const walk = (d: string): boolean => readdirSync(d, { withFileTypes: true }).some((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return false;
    const p = join(d, e.name);
    return e.isDirectory() ? walk(p) : /\.(m?[jt]sx?)$/.test(e.name) && /from\s+["']@\//.test(readFileSync(p, "utf8"));
  });
  return walk(root);
}

/** "" or "src": whichever base resolves more of the tree's own "@/x" imports (Next's --src-dir scaffold maps @/* to ./src/*). */
function inferAliasBase(root: string): string {
  const specs: string[] = [];
  const walk = (d: string): void => { for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(m?[jt]sx?)$/.test(e.name)) for (const m of readFileSync(p, "utf8").matchAll(/from\s+["']@\/([^"']+)["']/g)) specs.push(m[1]);
  } };
  walk(root);
  const hits = (base: string) => specs.filter((x) => ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"].some((ext) => existsSync(join(root, base, x + ext)))).length;
  return existsSync(join(root, "src")) && hits("src") > hits("") ? "src" : "";
}

export function prepareWorkspace(root: string, origin: AppWorkspace["origin"], lang: string): AppWorkspace {
  const ws: AppWorkspace = { root: resolve(root), origin, aliasAt: false, notes: [] };
  if (lang === "python") {
    const venv = [".venv/bin/python", "venv/bin/python"].map((p) => join(ws.root, p)).find(existsSync);
    ws.python = venv ?? "python3";
    ws.notes.push(venv ? `python: repo virtualenv ${venv}` : "python: system python3 (no repo virtualenv found)");
    return ws;
  }
  if (existsSync(join(ws.root, "package.json"))) {
    ws.nodeModules = installDeps(ws.root);
    if (!existsSync(join(ws.root, "node_modules"))) symlinkSync(ws.nodeModules, join(ws.root, "node_modules"), "dir");
    ws.notes.push(`npm deps from the app's package.json (cache ${ws.nodeModules})`);
  }
  if (!tsconfigHasPaths(ws.root) && usesAtAlias(ws.root)) {
    ws.aliasAt = true; ws.aliasBase = inferAliasBase(ws.root);
    ws.notes.push(`no tsconfig "paths" in tree: "@/x" resolved to <app root>/${ws.aliasBase ? ws.aliasBase + "/" : ""}x (inferred alias: the base under which the tree's own "@/" imports resolve)`);
  }
  const schemaPath = join(ws.root, "prisma", "schema.prisma");
  if (existsSync(schemaPath)) {
    const prov = prismaProvider(readFileSync(schemaPath, "utf8"));
    if (prov === "postgresql" && ws.nodeModules) { ws.db = prepareDb(ws.root, ws.nodeModules); ws.notes.push(`real PostgreSQL database from ${schemaPath} (template ${ws.db.template})`); }
    else ws.dbUnsupported = `prisma datasource provider "${prov}" is not supported by the real-DB runner (only postgresql)`;
  }
  return ws;
}

/**
 * Tree for the patched run. JS/TS: full copy (node_modules linked), because Node resolves symlinks to real paths and a linked
 * sibling would import the ORIGINAL file. Python: the frame file's ancestor directories are materialized, the frame file is
 * copied and every other entry is a symlink (Python keeps the sys.path-relative path, so imports reach the copy).
 */
export function copyTree(ws: AppWorkspace, dest: string, frameRel: string, lang: string): string {
  mkdirSync(dest, { recursive: true });
  if (lang !== "python") {
    const skip = new Set(["node_modules", ".venv", "venv", ".git", ".wce"]);
    for (const e of readdirSync(ws.root, { withFileTypes: true })) {
      const src = join(ws.root, e.name), dst = join(dest, e.name);
      if (skip.has(e.name)) { symlinkSync(e.isSymbolicLink() ? resolve(ws.root, readlinkSync(src)) : src, dst); continue; }
      cpSync(src, dst, { recursive: true, filter: (x) => !/\/(node_modules|\.git)(\/|$)/.test(x.slice(src.length)) });
    }
    return dest;
  }
  const parts = frameRel.split("/");
  let from = ws.root, to = dest;
  for (const [i, part] of parts.entries()) {
    for (const e of readdirSync(from)) if (e !== part && e !== "__pycache__") symlinkSync(join(from, e), join(to, e));
    if (i === parts.length - 1) cpSync(join(from, part), join(to, part));
    else { mkdirSync(join(to, part)); from = join(from, part); to = join(to, part); }
  }
  return dest;
}
