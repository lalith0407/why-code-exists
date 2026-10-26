/** Optional human-approve step: tsx src/bin/approve.ts --report <report.json> --decision approve|reject --by <name>. Approve stores the lesson (Meterless). */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { saveLesson } from "../engine/lesson.js";
import { writeGenericReport } from "../report/generic.js";
import { writeExplainReport } from "../report/explain.js";
import type { ExplainWhyResult } from "../explain/pipeline.js";
import {
  explainLessonStatus,
  explainStoreRefusal,
  isExplainWhyReport,
  lessonFromExplainReport,
  writeExplainLesson,
  type ExplainLessonSource,
  type ExplainLessonStatus,
} from "../lesson/explain-lesson.js";

const a = process.argv.slice(2); const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
const path = opt("report"), decision = opt("decision");
if (!path || !["approve", "reject"].includes(decision ?? "")) { console.error("usage: --report <report.json> --decision approve|reject [--by name]"); process.exit(2); }
const r = JSON.parse(readFileSync(path, "utf8"));
if (isExplainWhyReport(r)) {
  const report = r as ExplainLessonSource & { lesson_status?: ExplainLessonStatus; approval?: ExplainWhyResult["approval"] };
  const by = opt("by") ?? "reviewer";
  const approval: { decision: string; by: string; at: string; lesson?: string } = { decision: decision ?? "", by, at: new Date().toISOString() };
  if (!report.lesson_status) report.lesson_status = explainLessonStatus(report);
  if (decision === "approve") {
    const lesson = lessonFromExplainReport(report);
    if (!lesson) {
      console.error(`refusing: ${report.lesson_status.reason ?? explainStoreRefusal(report) ?? "no verified lesson to store"}`);
      process.exit(1);
    }
    const write = writeExplainLesson(lesson);
    report.lesson_status = {
      ...report.lesson_status,
      disposition: "stored",
      reason: undefined,
      lesson,
      write: { memory_id: write.memory_id, detail: write.detail, dir: write.dir },
    };
    approval.lesson = `${write.memory_id} (${write.detail})`;
  } else if (report.lesson_status.disposition === "pending") {
    report.lesson_status = { ...report.lesson_status, disposition: "rejected" };
  }
  report.approval = approval;
  writeFileSync(path, JSON.stringify(report, null, 2));
  writeExplainReport(report as ExplainWhyResult, join(dirname(path), "report.html"));
  console.log(JSON.stringify(approval));
} else {
  const approval: Record<string, unknown> = { decision, by: opt("by") ?? "reviewer", at: new Date().toISOString() };
  if (decision === "approve") {
    if (r.verdict !== "proven_false") { console.error(`refusing: verdict is ${r.verdict}, only proven_false can be approved as a lesson`); process.exit(1); }
    const s = await saveLesson(r);
    approval.lesson = s.write?.ok ? `${s.write.memory_id} (${s.write.detail})` : `not stored: ${s.write?.detail ?? "no lesson"}`;
  }
  r.approval = approval;
  writeFileSync(path, JSON.stringify(r, null, 2));
  writeGenericReport(r, join(dirname(path), "report.html"), path);
  console.log(JSON.stringify(approval));
}
