const STOP_WORDS = new Set("a an and are as at be can do for from how i if in is it me my of on or the this to what when where who will with you your".split(" "));
const CONCEPTS = [
  ["notice", ["notice", "days", "period", "resign", "quit", "leave"]],
  ["termination", ["terminate", "termination", "deactivate", "suspend", "dismiss", "end"]],
  ["pay", ["pay", "payout", "payment", "deduct", "deduction", "fee", "commission", "earnings"]],
  ["exclusive", ["exclusive", "exclusivity", "competitor", "non-compete", "noncompete", "outside work"]],
  ["arbitration", ["arbitration", "dispute", "court", "tribunal", "jurisdiction"]],
  ["leave", ["leave", "holiday", "absence", "sick"]],
  ["data", ["data", "privacy", "personal information", "information"]],
];

export function terms(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((word) => word && !STOP_WORDS.has(word));
}

function conceptMatches(question, text) {
  const q = question.toLowerCase();
  return CONCEPTS.filter(([, words]) => words.some((word) => q.includes(word)) && words.some((word) => text.includes(word))).length;
}

export function retrieve(question, chunks, limit = 4) {
  const qTerms = new Set(terms(question));
  return chunks
    .map((chunk) => {
      const text = chunk.text.toLowerCase();
      const textTerms = new Set(terms(text));
      const overlap = [...qTerms].filter((term) => textTerms.has(term)).length;
      const concepts = conceptMatches(question, `${chunk.heading} ${chunk.text}`.toLowerCase());
      const score = (overlap / Math.max(qTerms.size, 1)) * 0.65 + Math.min(concepts * 0.2, 0.35);
      return { ...chunk, score: Number(score.toFixed(3)) };
    })
    .filter((chunk) => chunk.score >= 0.16)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
