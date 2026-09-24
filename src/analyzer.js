import { retrieve } from "./retrieval.js";
import { scanRedFlags } from "./redFlags.js";
import { terms } from "./retrieval.js";

const LABELS = {
  en: {
    covered: "The document says",
    notCovered: "This document does not cover that question.",
    review: "Use this as a reading aid, not legal advice. Consider asking a qualified professional about your situation.",
    next: "Questions to clarify",
    noAnswer: "I could not find a clause that answers this precisely. I will not guess beyond the document.",
  },
  hi: {
    covered: "दस्तावेज़ में लिखा है",
    notCovered: "इस दस्तावेज़ में इस सवाल की जानकारी नहीं मिली।",
    review: "यह केवल दस्तावेज़ समझने में मदद है, कानूनी सलाह नहीं। अपनी स्थिति के लिए योग्य पेशेवर से पूछें।",
    next: "स्पष्ट करने के लिए सवाल",
    noAnswer: "इस सवाल का सटीक जवाब देने वाली धारा नहीं मिली। मैं दस्तावेज़ से आगे अनुमान नहीं लगाऊँगा।",
  },
};

function bestExcerpt(chunks) {
  const source = chunks[0];
  const sentences = source.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (sentences.find((sentence) => sentence.length > 30) || source.text).slice(0, 420);
}

function makePrompt(question, chunks, language) {
  return [
    "SYSTEM: You are a cautious legal-document reading assistant.",
    "Answer only from the supplied clauses. Every factual statement must cite a supplied clause ID.",
    "If the clauses do not answer the question, say NOT COVERED and do not infer.",
    "Do not provide legal advice or a definitive legal conclusion.",
    "Return JSON only: {\"status\":\"covered\"|\"not-covered\",\"answer\":\"...\",\"citedChunkIds\":[\"clause-N\"]}.",
    `OUTPUT LANGUAGE: ${language === "hi" ? "Hindi" : "English"}`,
    `QUESTION: ${question}`,
    "SOURCE CLAUSES:",
    ...chunks.map((chunk) => `[${chunk.id} | ${chunk.clause} | ${pageLabel(chunk)}] ${chunk.text}`),
  ].join("\n");
}

function pageLabel(chunk) {
  return chunk.pageSource === "estimated" ? `estimated page ${chunk.page}` : `page ${chunk.page}`;
}

function hasQuestionSignal(question, chunk) {
  const chunkTerms = new Set(terms(`${chunk.heading} ${chunk.text}`));
  return terms(question).some((term) => chunkTerms.has(term));
}

function isStronglyGrounded(chunk) {
  if (!chunk) return false;
  const normalGrounding = chunk.score >= 0.22 && chunk.overlap >= 1 && chunk.matchedConcepts.length > 0;
  // Exclusivity is the deliberate synonym exception: "non-compete" can be
  // written as "exclusivity" or "competing platform" in the agreement.
  const exclusivityGrounding = chunk.score >= 0.18 && chunk.matchedConcepts.includes("exclusive");
  return normalGrounding || exclusivityGrounding;
}

function localAnswer(question, chunks, language) {
  const copy = LABELS[language];
  const explicitAbsence = chunks.find((chunk) => /does not (?:describe|cover)|not (?:covered|addressed)|no information/i.test(chunk.text) && hasQuestionSignal(question, chunk));
  if (!chunks.length || explicitAbsence) {
    return {
      status: "not-covered",
      answer: `${copy.notCovered}${explicitAbsence ? ` [${explicitAbsence.clause}, ${pageLabel(explicitAbsence)}]` : ""} ${copy.review}`,
      checklist: [copy.next, language === "hi" ? "इस विषय पर अनुबंध में अलग धारा है या नहीं पूछें।" : "Ask where this topic is addressed, if anywhere.", language === "hi" ? "हस्ताक्षर से पहले पेशेवर सलाह लें।" : "Get professional advice before signing if the issue affects your income or rights."],
    };
  }
  const source = chunks[0];
  const excerpt = bestExcerpt(chunks);
  const answer = language === "hi"
    ? `${copy.covered} “${excerpt}” [${source.clause}, ${pageLabel(source)}] यह धारा आपके सवाल से संबंधित है, लेकिन इसका वास्तविक प्रभाव आपकी परिस्थिति और लागू कानून पर निर्भर हो सकता है। ${copy.review}`
    : `${copy.covered}: “${excerpt}” [${source.clause}, ${pageLabel(source)}] This is the relevant wording I found for your question. Its legal effect can depend on your circumstances and applicable law. ${copy.review}`;
  return {
    status: "covered",
    answer,
    checklist: language === "hi"
      ? ["इस धारा में बताई समय-सीमा या शर्त लिखकर रखें।", "प्लेटफ़ॉर्म/नियोक्ता से अस्पष्ट शब्दों का उदाहरण माँगें।", "हस्ताक्षर से पहले पेशेवर से महत्वपूर्ण जोखिम की समीक्षा कराएँ।"]
      : ["Save the stated time limit or condition somewhere you can find it.", "Ask the platform or employer for an example of any ambiguous wording.", "Have a professional review material risks before you sign."],
  };
}

async function tryGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 700 } }),
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}.`);
  const body = await response.json();
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || null;
}

export function validateModelOutput(value, chunks) {
  try {
    const clean = value.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(clean);
    const validIds = new Set(chunks.map((chunk) => chunk.id));
    if (parsed.status !== "covered" || typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
    if (!Array.isArray(parsed.citedChunkIds) || !parsed.citedChunkIds.length) return null;
    if (parsed.citedChunkIds.some((id) => !validIds.has(id))) return null;
    return parsed.answer.trim();
  } catch {
    return null;
  }
}

export async function analyzeQuestion({ document, question, language = "en" }) {
  const retrieved = retrieve(question, document.chunks);
  const explicitAbsence = document.chunks.find((chunk) => /does not (?:describe|cover)|not (?:covered|addressed)|no information/i.test(chunk.text) && hasQuestionSignal(question, chunk));
  const grounded = retrieved.filter(isStronglyGrounded);
  const answerChunks = grounded.length ? grounded : (explicitAbsence ? [explicitAbsence] : []);
  const local = localAnswer(question, answerChunks, language);
  const prompt = makePrompt(question, answerChunks, language);
  let responseText = local.answer;
  let provider = "Local grounded demo engine";
  if (process.env.GEMINI_API_KEY && local.status === "covered" && grounded.length) {
    try {
      const modelOutput = await tryGemini(prompt);
      const validated = modelOutput ? validateModelOutput(modelOutput, grounded) : null;
      responseText = validated || local.answer;
      provider = validated ? "Google Gemini (validated)" : "Local grounded demo engine (Gemini response rejected)";
    } catch {
      provider = "Local grounded demo engine (AI provider unavailable)";
    }
  }
  const citations = answerChunks.map((chunk) => ({ chunkId: chunk.id, clause: chunk.clause, page: chunk.page, pageSource: chunk.pageSource, heading: chunk.heading, excerpt: chunk.text.slice(0, 320) }));
  return {
    document: { filename: document.filename, clauses: document.chunks.length, pages: document.pages },
    status: local.status,
    answer: responseText,
    citations,
    redFlags: scanRedFlags(document.chunks),
    checklist: local.checklist,
    debug: {
      provider,
      prompt,
      response: responseText,
      groundedChunkIds: grounded.map((chunk) => chunk.id),
    },
  };
}
