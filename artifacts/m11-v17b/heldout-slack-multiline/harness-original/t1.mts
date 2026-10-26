// @ts-nocheck
import { execFileSync as __x } from "node:child_process";
import { pathToFileURL as __u } from "node:url";
const __root = "/workspace/open-agent/why-code-exists/artifacts/m11-v17b/heldout-slack-multiline/app";
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
  const { POST } = await app("app/api/slack/events/[slug]/route.ts");
  const { parsePulseCommand } = await app("lib/slack.ts");

  // Create a workspace with slackSigningSecret
  const workspace = await prisma.workspace.create({
    data: {
      name: "Test Workspace",
      slug: "test-workspace",
      slackSigningSecret: "test-secret",
      webhookSecret: "secret",
    },
  });

  // Import NextRequest from next/server
  const { NextRequest } = await import("next/server");
  // Import crypto for signature creation
  const crypto = await import("crypto");

  // Helper to create a valid Slack signature for the test
  function createSlackSignature(signingSecret, timestamp, rawBody) {
    const baseString = `v0:${timestamp}:${rawBody}`;
    const hmac = crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
    return `v0=${hmac}`;
  }

  // Helper to create a NextRequest with headers and body
  function createSlackRequest(bodyObj) {
    const rawBody = JSON.stringify(bodyObj);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createSlackSignature(workspace.slackSigningSecret, timestamp, rawBody);

    const headers = new Headers();
    headers.set("x-slack-request-timestamp", timestamp);
    headers.set("x-slack-signature", signature);

    return new NextRequest("http://localhost/api/slack/events/test-workspace", {
      method: "POST",
      headers,
      body: rawBody,
    });
  }

  // Clean up any existing data before tests
  await prisma.slackEventLog.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.slackEventLog.deleteMany();

  arranged();
  await (async () => {
    // Prepare a Slack event with a valid pulse feedback command text
    const slackEvent = {
      type: "event_callback",
      event: {
        type: "message",
        text: "pulse feedback This is a test feedback",
        user: "U12345",
      },
    };

    const request = createSlackRequest(slackEvent);

    // Clear any previous feedback entries
    await prisma.feedback.deleteMany({ where: { workspaceId: workspace.id } });

    // Call the POST handler
    const response = await POST(request, { params: Promise.resolve({ slug: workspace.slug }) });

    // Check the response is ok
    const json = await response.json();
    check(json.ok === true, "POST returns ok true for valid pulse feedback event");

    // Verify that a feedback row was created in the database
    const feedbacks = await prisma.feedback.findMany({ where: { workspaceId: workspace.id } });
    check(feedbacks.length > 0, "A feedback entry is created in the database for pulse feedback command");

    // Verify the feedback title matches the command text
    check(feedbacks.some(fb => fb.title.includes("This is a test feedback")), "Feedback title matches the pulse feedback command text");
  })();
  if (globalThis.__wce_after?.length) await Promise.all(globalThis.__wce_after);
} catch (e) { __pass = false; __stack = String(e?.stack ?? e); __err = __stack.split("\n").slice(0, 3).join(" | ").slice(0, 400); }
const __after = __snap();
console.log("__WCE_RESULTS__" + JSON.stringify({ pass: __pass, error: __err, stack: __stack, arranged: __arranged, after: __after, recorded: __rec }));
process.exit(0);
