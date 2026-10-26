/** Build a call-B response in the subject/action schema: evidence stated for every check, confirmation = (check_id !== "none"). */
export function bContent(body: any, mappings: Array<{ claim_index: number; check_id: string; same?: boolean }>) {
  const checks = (JSON.parse(body.messages[1].content).available_checks ?? []) as Array<{ id: string }>;
  return {
    check_evidence: checks.map((c) => ({ check_id: c.id, subject: "s", action: "a" })),
    mappings: mappings.map((m) => ({
      claim_index: m.claim_index, claim_subject: "s", claim_action: "a", check_id: m.check_id,
      same_subject_and_action: m.same ?? m.check_id !== "none",
    })),
  };
}
