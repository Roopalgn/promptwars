export const RED_FLAG_PATTERNS = [
  {
    id: "sole-discretion",
    title: "One-sided decision power",
    severity: "Review",
    pattern: /sole discretion|without assigning any reason|at any time without notice/i,
    rationale: "The wording may give one party broad power to change or end the arrangement without a clear process.",
    action: "Ask what notice, reasons, and appeal process apply before signing.",
  },
  {
    id: "pay-deduction",
    title: "Unclear payout deductions",
    severity: "Important",
    pattern: /deduct|deduction|recover.*from.*payout|penalty|fine/i,
    rationale: "Deductions or penalties appear in this clause; the trigger, cap, or dispute process should be clear.",
    action: "Ask for a written list of deductions and whether there is a maximum amount.",
  },
  {
    id: "mandatory-arbitration",
    title: "Mandatory arbitration",
    severity: "Review",
    pattern: /mandatory arbitration|disputes? shall be resolved.*arbitration|waive.*court/i,
    rationale: "The clause routes disputes to arbitration and may limit the forums available to the worker.",
    action: "Ask about the arbitrator, fees, location, and whether local legal help is available.",
  },
  {
    id: "broad-exclusivity",
    title: "Broad exclusivity or non-compete",
    severity: "Important",
    pattern: /exclusive|exclusivity|non[- ]?compete|competitor/i,
    rationale: "The wording may restrict other work; its duration, territory, and scope should be checked carefully.",
    action: "Ask whether you can work elsewhere and exactly when this restriction ends.",
  },
  {
    id: "no-notice",
    title: "Termination without notice",
    severity: "Important",
    pattern: /terminate.*without notice|deactivat(?:e|ion).*without notice|immediate termination/i,
    rationale: "The clause appears to allow termination or deactivation without advance notice.",
    action: "Ask what events trigger immediate action and whether there is an appeal or review route.",
  },
];

export function scanRedFlags(chunks) {
  const findings = [];
  for (const pattern of RED_FLAG_PATTERNS) {
    const match = chunks.find((chunk) => pattern.pattern.test(`${chunk.heading} ${chunk.text}`));
    if (!match) continue;
    findings.push({
      id: pattern.id,
      title: pattern.title,
      severity: pattern.severity,
      rationale: pattern.rationale,
      action: pattern.action,
      citation: { clause: match.clause, page: match.page, chunkId: match.id },
      excerpt: match.text.slice(0, 240),
    });
  }
  return findings;
}
