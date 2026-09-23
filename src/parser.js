const MAX_DOCUMENT_CHARS = 1_400_000;

function cleanText(value) {
  return value
    .replaceAll("\u0000", "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPdfText(raw) {
  // Lightweight extraction for simple text PDFs. A production deployment should
  // use a maintained PDF parser, but this keeps the no-dependency demo safe.
  const matches = [...raw.matchAll(/\(([^()]*)\)\s*Tj/g)];
  if (matches.length) return matches.map((match) => match[1]).join("\n");
  return raw
    .replace(/stream[\s\S]*?endstream/g, "")
    .replace(/[^\x20-\x7E\n\r\f]/g, " ");
}

function looksLikeHeading(line) {
  return /^(?:clause\s+)?\d+(?:\.\d+)*[.)]?\s+\S/i.test(line)
    || /^section\s+[A-Z0-9]/i.test(line)
    || /^[A-Z][A-Z\s/&-]{5,}$/.test(line);
}

function clauseLabel(heading, index) {
  const match = heading.match(/^(?:clause\s+)?([\d.]+|[A-Z])\s*[.)-]?/i);
  return match ? `Clause ${match[1].replace(/[.]$/, "")}` : `Section ${index + 1}`;
}

export function parseDocument({ filename, content }) {
  const safeName = String(filename || "uploaded-document.txt").slice(0, 160);
  let raw = String(content || "").slice(0, MAX_DOCUMENT_CHARS);
  if (/\.pdf$/i.test(safeName)) raw = extractPdfText(raw);
  const normalized = cleanText(raw.replace(/\r\n?/g, "\n"));
  const lines = normalized.split("\n");
  const chunks = [];
  let page = 1;
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const text = cleanText(current.text);
    if (text.length >= 20) {
      chunks.push({
        id: `clause-${chunks.length + 1}`,
        clause: current.clause,
        heading: current.heading,
        page: current.page,
        text,
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "\f" || /^page\s+\d+$/i.test(line)) {
      page += 1;
      continue;
    }
    if (looksLikeHeading(line)) {
      pushCurrent();
      current = { heading: line, clause: clauseLabel(line, chunks.length), page, text: "" };
      continue;
    }
    if (!current) current = { heading: "Document context", clause: "Preamble", page, text: "" };
    current.text += `${line} `;
  }
  pushCurrent();

  return {
    filename: safeName,
    text: normalized,
    chunks,
    pages: page,
  };
}
