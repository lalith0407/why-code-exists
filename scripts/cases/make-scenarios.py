"""Writes cases/*/scenario.json: the real-run scenarios that produce each case's error.json via src/bin/capture-error.ts.
Case DATA, not engine code. Stubs are only for Next.js/NextAuth request-context packages (true runtime boundary)."""
import json, os
NEXT = [
 {"module":"next/cache","code":"export function revalidatePath(){}\nexport function revalidateTag(){}","why":"Next.js request-scoped cache API; needs a running Next server"},
 {"module":"next/navigation","code":"export function notFound(){ const e = new Error('NEXT_NOT_FOUND'); e.digest = 'NEXT_NOT_FOUND'; throw e }\nexport function redirect(u){ const e = new Error('NEXT_REDIRECT ' + u); e.digest = 'NEXT_REDIRECT'; throw e }","why":"Next.js navigation throws control-flow errors the framework catches"},
 {"module":"next-auth","code":"export default function NextAuth(){ return { auth: async () => globalThis.__session ?? null, handlers: {}, signIn: async () => {}, signOut: async () => {} } }","why":"session provider: the signed-in user normally comes from the request cookie"},
 {"module":"next-auth/providers/credentials","code":"export default function Credentials(o){ return o }","why":"auth provider config object"},
]
SEED = '''const { prisma } = await app("lib/prisma.ts");
const alice = await prisma.user.create({ data: { email: "alice@example.com", name: "Alice", passwordHash: "x" } });
const bob = await prisma.user.create({ data: { email: "bob@example.com", name: "Bob", passwordHash: "x" } });
const w = await prisma.workspace.create({ data: { name: "Acme", slug: "acme", webhookSecret: "whsec-test", slackSigningSecret: "slack-signing-test" } });
await prisma.membership.create({ data: { userId: alice.id, workspaceId: w.id, role: "ADMIN" } });'''
SLACK = '''const crypto = await import("node:crypto");
const { POST } = await app("app/api/slack/events/[slug]/route.ts");
const { NextRequest } = await import("next/server");
const deliver = async (payload, headers = {}) => {
  const body = JSON.stringify(payload), ts = String(Math.floor(Date.now() / 1000));
  const sig = "v0=" + crypto.createHmac("sha256", "slack-signing-test").update(`v0:${ts}:${body}`).digest("hex");
  const req = new NextRequest("http://localhost/api/slack/events/acme", { method: "POST", body, headers: { "content-type": "application/json", "x-slack-request-timestamp": ts, "x-slack-signature": sig, ...headers } });
  const res = await POST(req, { params: Promise.resolve({ slug: "acme" }) });
  return res.status;
};'''
S = {
 "pulseboard-invite": {"id":"pulseboard-invite-accept","service":"pulseboard","severity":"critical","lang":"ts","stubs":NEXT,
  "setup": SEED + '''
const inv = await prisma.invite.create({ data: { email: "carol@example.com", role: "ADMIN", token: "tok-1", expiresAt: new Date(Date.now() + 864e5), workspaceId: w.id, invitedById: alice.id } });
const { acceptInviteForExistingUserAction } = await app("lib/actions/invites.ts");''',
  "body": '''globalThis.__session = { user: { id: bob.id, email: bob.email } };
try { await acceptInviteForExistingUserAction("tok-1"); } catch (e) { if (!String(e.message).startsWith("NEXT_REDIRECT")) throw e; }
const m = await prisma.membership.findFirst({ where: { userId: bob.id, workspaceId: w.id } });
check(m, "no membership created");
record("member_email", bob.email); record("role", m.role); record("invite_email", inv.email); record("slug", w.slug);''',
  "symptom":{"message":"Security alert: user {{member_email}} became {{role}} of workspace '{{slug}}' by accepting an invite that was addressed to {{invite_email}}",
   "frames":[{"file":"lib/actions/invites.ts","line":0,"function":"acceptInviteForExistingUserAction"}]}},
 "pulseboard-ssrf": {"id":"pulseboard-link-preview","service":"pulseboard","severity":"high","lang":"ts","stubs":[],
  "setup": '''const http = await import("node:http");
const hits = [];
const srv = http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { "content-type": "text/html" }); res.end("<html><head><title>Internal admin console</title></head></html>"); });
await new Promise((r) => srv.listen(8080, "127.0.0.1", r));
const { fetchLinkPreview } = await app("lib/link-preview.ts");''',
  "body": '''const p = await fetchLinkPreview("http://127.0.0.1:8080/admin");
srv.close();
check(hits.length > 0, "no request reached the internal address");
record("url", "http://127.0.0.1:8080" + hits[0]); record("title", p?.title ?? null);''',
  "symptom":{"message":"Egress alert: link preview service made a request to {{url}} while creating a feedback card; the preview title returned was {{title}}",
   "frames":[{"file":"lib/link-preview.ts","line":0,"function":"fetchLinkPreview"}]}},
 "pulseboard-slack-retry": {"id":"pulseboard-slack-events","service":"pulseboard","severity":"high","lang":"ts","stubs":NEXT,
  "setup": SEED + "\n" + SLACK,
  "body": '''const ev = { type: "event_callback", event_id: "Ev01", event: { type: "message", text: "/pulse feedback Export button is broken", user: "U1" } };
const statuses = [await deliver(ev), await deliver(ev, { "x-slack-retry-num": "1", "x-slack-retry-reason": "http_timeout" }), await deliver(ev, { "x-slack-retry-num": "2", "x-slack-retry-reason": "http_timeout" })];
const n = await prisma.feedback.count({ where: { workspaceId: w.id, source: "SLACK" } });
check(n > 1, "duplicates not created");
record("rows", n); record("statuses", statuses.join(", "));''',
  "symptom":{"message":"Data integrity alert: {{rows}} identical feedback rows were created from one Slack message; the request log shows the same event_id delivered 3 times (X-Slack-Retry-Num: absent, 1, 2), answered {{statuses}}",
   "frames":[{"file":"app/api/slack/events/[slug]/route.ts","line":0,"function":"POST"}]}},
 "heldout-slack-multiline": {"id":"pulseboard-slack-dropped-command","service":"pulseboard","severity":"warning","lang":"ts","stubs":NEXT,
  "setup": SEED + "\n" + SLACK,
  "body": '''const text = "/pulse feedback Export is slow\\nIt takes 2 minutes for 10k rows";
const status = await deliver({ type: "event_callback", event_id: "Ev02", event: { type: "message", text, user: "U1" } });
const log = await prisma.slackEventLog.findFirst({ where: { workspaceId: w.id } });
check(log && log.createdFeedbackId === null, "feedback was created");
record("status", status); record("text", JSON.stringify(log.text));''',
  "symptom":{"message":"Support ticket: a Slack message starting with '/pulse feedback' did not create feedback. The Slack event log shows the event arrived (HTTP {{status}}) with createdFeedbackId = null and text {{text}}.",
   "frames":[{"file":"app/api/slack/events/[slug]/route.ts","line":0,"function":"POST"}]}},
 "heldout-xirr-short": {"id":"ta-irr-missing","service":"trading-agent-system","severity":"warning","lang":"python","stubs":[],
  "setup": '''import datetime
metrics = app("src/ta/sim/metrics.py")''',
  "body": '''flows = [(datetime.date(2024, 1, 2), -100000.0), (datetime.date(2024, 1, 12), 106000.0)]
irr = metrics._xirr(flows)
check(irr is None, "irr computed")
record("irr", repr(irr)); record("flows", [(d.isoformat(), v) for d, v in flows])''',
  "symptom":{"message":"Memo renders IRR as n/a: PerformanceReport.irr is {{irr}} for a 10-calendar-day backtest (start equity 100000.00, end equity 106000.00, no contributions). Cash flows passed to the IRR solver: {{flows}}.",
   "frames":[{"file":"src/ta/sim/metrics.py","line":0,"function":"_xirr"},{"file":"src/ta/sim/metrics.py","line":0,"function":"performance"},{"file":"src/ta/memo/render.py","line":0,"function":"_row"}]}},
}
for case, sc in S.items():
    json.dump(sc, open(os.path.join("cases", case, "scenario.json"), "w"), indent=2)
    print("wrote", case)
