// @ts-nocheck
import { execFileSync as __x } from "node:child_process";
import { pathToFileURL as __u } from "node:url";
const __root = "/workspace/open-agent/why-code-exists/artifacts/m12-v18a/heldout2-webhook-block/app-patched";
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
  const { createFeedbackAction } = await app("lib/actions/feedback.ts");
  const { requireUser } = await app("lib/workspace.ts");
  const http = await import("node:http");

  // Create a user
  const user = await prisma.user.create({
    data: {
      email: "testuser@example.com",
      name: "Test User",
      passwordHash: "hashedpassword",
    },
  });

  // Create a workspace with webhookUrl and webhookSecret
  const workspace = await prisma.workspace.create({
    data: {
      name: "Test Workspace",
      slug: "test-workspace",
      webhookUrl: null, // will update after server starts
      webhookSecret: "secret",
    },
  });

  // Create membership for user in workspace
  await prisma.membership.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      role: "ADMIN",
    },
  });

  // Set session for the user
  set_session({ user: { id: user.id, email: user.email, name: user.name } });

  // Prepare valid formData
  const formData = new FormData();
  formData.set("title", "Test Feedback Title");
  formData.set("body", "This is a test feedback body.");

  // Setup a local HTTP server to simulate webhook endpoint
  let webhookRequestReceived = false;

  const server = http.createServer((req, res) => {
    webhookRequestReceived = true;
    // Respond after 8 seconds to simulate slow webhook
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    }, 8000);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (address && typeof address === "object") {
        // Update workspace webhookUrl to actual server address
        await prisma.workspace.update({
          where: { id: workspace.id },
          data: { webhookUrl: `http://127.0.0.1:${address.port}/webhook` },
        });
      }
      resolve();
    });
  });

  arranged();
  await (async () => {
    // Call createFeedbackAction with valid formData
    const result = await createFeedbackAction("test-workspace", {}, formData);

    // Check that the feedback was actually created in the database
    const feedbackInDb = await prisma.feedback.findFirst({
      where: { title: "Test Feedback Title", authorId: user.id },
    });

    check(result.success === true, "createFeedbackAction returns success");
    check(feedbackInDb !== null, "Feedback was created in the database");
    check(feedbackInDb.title === "Test Feedback Title", "Feedback title matches input");
    check(feedbackInDb.body === "This is a test feedback body.", "Feedback body matches input");
  })();
  if (globalThis.__wce_after?.length) await Promise.all(globalThis.__wce_after);
} catch (e) { __pass = false; __stack = String(e?.stack ?? e); __err = __stack.split("\n").slice(0, 3).join(" | ").slice(0, 400); }
const __after = __snap();
console.log("__WCE_RESULTS__" + JSON.stringify({ pass: __pass, error: __err, stack: __stack, arranged: __arranged, after: __after, recorded: __rec }));
process.exit(0);
