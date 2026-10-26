// @ts-nocheck
import { execFileSync as __x } from "node:child_process";
import { pathToFileURL as __u } from "node:url";
const __root = "/workspace/open-agent/why-code-exists/artifacts/m12-v18a/pulseboard-invite/app-rival";
const __rec = [];
const __snap = () => process.env.WCE_DB_NAME ? JSON.parse(__x(process.env.WCE_PSQL, ["-h", process.env.WCE_PG_SOCKET, "-p", process.env.WCE_PG_PORT, "-U", "wce", "-d", process.env.WCE_DB_NAME, "-At", "-c", "select wce_meta.snapshot()"], { encoding: "utf8" })) : null;
let __arranged = null;
globalThis.check = (cond, msg = "check failed") => { if (!cond) throw new Error(msg); };
globalThis.harm_observed = (cond, msg = "harmful outcome not observed") => { if (!cond) throw new Error("harmful outcome not observed: " + msg); };
globalThis.record = (name, value) => { __rec.push({ name, value: JSON.parse(JSON.stringify(value ?? null)) }); };
globalThis.arranged = () => { __arranged = __snap(); };
globalThis.__wce_session = null; globalThis.__wce_request = { headers: {}, cookies: {} };
globalThis.set_session = (s) => { globalThis.__wce_session = s && typeof s === "object" && !("expires" in s) ? { ...s, expires: new Date(Date.now() + 864e5).toISOString() } : (s ?? null); };
globalThis.set_request = (r = {}) => { globalThis.__wce_request = { headers: r.headers ?? {}, cookies: r.cookies ?? {} }; };
// Framework control flow: Next.js redirect()/notFound()/forbidden() throw errors whose digest the framework turns into a response.
globalThis.settle = async (p) => { try { return { ok: true, value: await (typeof p === "function" ? p() : p) }; } catch (e) {
  const d = String(e?.digest ?? "");
  if (d.startsWith("NEXT_REDIRECT")) return { ok: true, redirect: d.split(";")[2] ?? d.split(";")[1] ?? "" };
  if (d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND") return { ok: true, http_status: Number(d.split(";")[1] ?? 404) };
  return { ok: false, error: e }; } };
globalThis.framework_calls = (name) => (globalThis.__wce_fw_calls ?? []).filter((c) => !name || c.name === name);
globalThis.app = (p) => import(__u(__root + "/" + p.replace(/^\/+/, "")).href);
// Browser rendering for client UI code: dom() installs a jsdom window as the global DOM; console_errors() returns what the code logged via console.error (e.g. React dev warnings).
const { format: __fmt } = await import("node:util");
const __cerr = []; { const __ce = console.error; console.error = (...a) => { __cerr.push(__fmt(...a)); __ce(...a); }; }
globalThis.console_errors = () => __cerr.slice();
globalThis.dom = async (url = "http://localhost/") => { const { JSDOM } = await import("file:///workspace/open-agent/why-code-exists/node_modules/jsdom/lib/api.js"); const d = new JSDOM("<!doctype html><html><body></body></html>", { url, pretendToBeVisual: true });
  const w = d.window; globalThis.window = w; globalThis.self = w; globalThis.document = w.document;
  for (const k of Object.getOwnPropertyNames(w)) { if (!(k in globalThis)) { try { globalThis[k] = w[k]; } catch {} } }
  if (!w.matchMedia) w.matchMedia = globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; return w; };
let __pass = true, __err, __stack;
try {
  const { prisma } = await app("lib/prisma.ts");
  const { requireUser } = await app("lib/workspace.ts");
  const { acceptInviteForExistingUserAction } = await app("lib/actions/invites.ts");

  // Create users
  const bob = await prisma.user.create({ data: { email: "bob@example.com", name: "Bob", passwordHash: "hash" } });
  const carol = await prisma.user.create({ data: { email: "carol@example.com", name: "Carol", passwordHash: "hash" } });

  // Create workspace
  const acme = await prisma.workspace.create({ data: { name: "Acme", slug: "acme", webhookSecret: "secret" } });

  // Create invite addressed to Carol for ADMIN role
  const inviteToken = "token123";
  const invite = await prisma.invite.create({
    data: {
      email: "carol@example.com",
      role: "ADMIN",
      token: inviteToken,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour in future
      workspaceId: acme.id,
      invitedById: carol.id,
    },
  });

  // Stub requireUser to return Bob as the logged-in user
  // We simulate logged-in user by setting session
  set_session({ user: { id: bob.id, email: bob.email, name: bob.name } });

  arranged();
  await (async () => {
    // Create a new user Dave
    const dave = await prisma.user.create({ data: { email: "dave@example.com", name: "Dave", passwordHash: "hash" } });

    // Create a new invite for Dave with MEMBER role
    const token2 = "token456";
    const invite2 = await prisma.invite.create({
      data: {
        email: "dave@example.com",
        role: "MEMBER",
        token: token2,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        workspaceId: acme.id,
        invitedById: carol.id,
      },
    });

    // Set session as Dave
    set_session({ user: { id: dave.id, email: dave.email, name: dave.name } });

    arranged();

    let result2 = null;
    let error2 = null;
    try {
      result2 = await acceptInviteForExistingUserAction(token2);
    } catch (e) {
      error2 = e;
    }

    const membership = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: dave.id, workspaceId: acme.id } } });
    const membershipRole = membership ? membership.role : null;

    const updatedInvite = await prisma.invite.findUnique({ where: { token: token2 } });
    const inviteStatus = updatedInvite ? updatedInvite.status : null;

    record("result2", result2);
    record("error2", error2 ? String(error2) : null);
    record("membershipRole", membershipRole);
    record("inviteStatus", inviteStatus);

    check(membershipRole === "MEMBER", "Membership role is MEMBER as per invite");
    check(inviteStatus === "ACCEPTED", "Invite status is ACCEPTED after acceptance");
  })();
  if (globalThis.__wce_after?.length) await Promise.all(globalThis.__wce_after);
} catch (e) { __pass = false; __stack = String(e?.stack ?? e); __err = __stack.split("\n").slice(0, 3).join(" | ").slice(0, 400); }
const __after = __snap();
console.log("__WCE_RESULTS__" + JSON.stringify({ pass: __pass, error: __err, stack: __stack, arranged: __arranged, after: __after, recorded: __rec }));
process.exit(0);
