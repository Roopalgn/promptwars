import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDocument } from "../src/parser.js";
import { retrieve } from "../src/retrieval.js";
import { scanRedFlags } from "../src/redFlags.js";
import { analyzeQuestion, validateModelOutput } from "../src/analyzer.js";
import { escapeHtml } from "../public/escape.js";

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

test("exclusivity questions agree with the exclusivity red flag", async () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  for (const question of [
    "Is there a non-compete clause?",
    "Am I allowed to work for another delivery platform?",
    "Can I work part-time for a competitor?",
  ]) {
    const result = await analyzeQuestion({ document, question });
    assert.equal(result.status, "covered", question);
    assert.equal(result.citations[0].clause, "Clause 4", question);
    assert.ok(result.redFlags.some((flag) => flag.id === "broad-exclusivity"), question);
  }
});

test("unknown question is refused instead of guessed", async () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  const result = await analyzeQuestion({ document, question: "What happens to my stock options if I resign?" });
  assert.equal(result.status, "not-covered");
  assert.match(result.answer, /does not cover/i);
  assert.equal(result.citations[0].clause, "Clause 7");
});

test("question with no document signal is refused without a disclaimer clause", async () => {
  const document = parseDocument({ filename: "short.txt", content: "1. Payment\nThe worker is paid weekly after verified assignments.\n\n2. Notice\nEither party may give 14 days written notice." });
  const result = await analyzeQuestion({ document, question: "Does this include visa sponsorship?" });
  assert.equal(result.status, "not-covered");
  assert.deepEqual(result.citations, []);
});

test("ordinary lexical overlap does not bypass the non-exclusivity grounding gate", async () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  const result = await analyzeQuestion({ document, question: "What is the worker's name?" });
  assert.equal(result.status, "not-covered");
});

test("plain text pages are marked as estimates while explicit markers are document pages", () => {
  const estimated = parseDocument({ filename: "long.txt", content: `1. First\n${"word ".repeat(420)}\n\n2. Second\nA second clause with enough text to parse.` });
  assert.equal(estimated.chunks[0].pageSource, "estimated");
  assert.ok(estimated.chunks[1].page > estimated.chunks[0].page);

  const marked = parseDocument({ filename: "marked.txt", content: "1. First\nA clause with enough text to parse.\nPAGE 2\n2. Second\nAnother clause with enough text to parse." });
  assert.equal(marked.chunks[1].page, 2);
  assert.equal(marked.chunks[1].pageSource, "document");
});

test("model output is accepted only when it is valid JSON citing supplied chunks", () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  const chunks = retrieve("What is my notice period?", document.chunks);
  assert.match(validateModelOutput(JSON.stringify({ status: "covered", answer: "The clause says 14 days [clause-2].", citedChunkIds: [chunks[0].id] }), chunks), /14 days/);
  assert.equal(validateModelOutput(JSON.stringify({ status: "covered", answer: "Unsupported claim.", citedChunkIds: ["clause-999"] }), chunks), null);
});

test("rendered values can be safely escaped before entering HTML", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("red flag scanner identifies reviewable patterns and anchors them", () => {
  const document = parseDocument({ filename: "agreement.txt", content });
  const flags = scanRedFlags(document.chunks);
  assert.ok(flags.some((flag) => flag.id === "mandatory-arbitration" && flag.citation.clause === "Clause 5"));
  assert.ok(flags.some((flag) => flag.id === "sole-discretion"));
});
