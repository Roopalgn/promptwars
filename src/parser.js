const MAX_DOCUMENT_CHARS = 1_400_000;
const ESTIMATED_PAGE_CHARS = 1800;

function cleanText(value) {
  return value
    .replaceAll("\u0000", "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const raw = String(content || "").slice(0, MAX_DOCUMENT_CHARS);
  const normalized = cleanText(raw.replace(/\r\n?/g, "\n"));
  const lines = normalized.split("\n");
  const hasPageMarkers = lines.some((line) => line.trim() === "\f" || /^page\s+\d+$/i.test(line.trim()));
  const chunks = [];
  let page = 1;
  let characterOffset = 0;
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
        pageSource: current.pageSource,
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
      const estimatedPage = Math.floor(characterOffset / ESTIMATED_PAGE_CHARS) + 1;
      current = {
        heading: line,
        clause: clauseLabel(line, chunks.length),
        page: hasPageMarkers ? page : estimatedPage,
        pageSource: hasPageMarkers ? "document" : "estimated",
        text: "",
      };
      continue;
    }
    if (!current) current = {
      heading: "Document context",
      clause: "Preamble",
      page: hasPageMarkers ? page : Math.floor(characterOffset / ESTIMATED_PAGE_CHARS) + 1,
      pageSource: hasPageMarkers ? "document" : "estimated",
      text: "",
    };
    current.text += `${line} `;
    characterOffset += line.length + 1;
  }
  pushCurrent();

  return {
    filename: safeName,
    text: normalized,
    chunks,
    pages: hasPageMarkers ? page : Math.max(1, Math.ceil(characterOffset / ESTIMATED_PAGE_CHARS)),
  };
}
