import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDocument } from "../src/parser.js";
import { retrieve } from "../src/retrieval.js";
import { scanRedFlags } from "../src/redFlags.js";
import { analyzeQuestion } from "../src/analyzer.js";

const content = await readFile(new URL("../sample/worker-agreement.txt", import.meta.url), "utf8");

test("parses numbered clauses with stable citation metadata", () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  assert.equal(document.chunks.length, 7);
  assert.equal(document.chunks[1].clause, "Clause 2");
  assert.match(document.chunks[1].text, /14 days/);
});

test("retrieval finds the notice clause for a notice question", () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  const results = retrieve("What is my notice period if I quit?", document.chunks);
  assert.equal(results[0].clause, "Clause 2");
});

test("unknown question is refused instead of guessed", async () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  const result = await analyzeQuestion({ document, question: "What happens to my stock options if I resign?" });
  assert.equal(result.status, "not-covered");
  assert.match(result.answer, /does not cover/i);
  assert.equal(result.citations[0].clause, "Clause 7");
});

test("red flag scanner identifies reviewable patterns and anchors them", () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  const flags = scanRedFlags(document.chunks);
  assert.ok(flags.some((flag) => flag.id === "mandatory-arbitration" && flag.citation.clause === "Clause 5"));
  assert.ok(flags.some((flag) => flag.id === "sole-discretion"));
});
