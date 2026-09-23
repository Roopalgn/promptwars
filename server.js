import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "./src/parser.js";
import { analyzeQuestion } from "./src/analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const samplePath = path.join(__dirname, "sample", "worker-agreement.txt");
const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 1_500_000;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Request is too large. Please use a document under 1.5 MB."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (req.method === "GET" && url.pathname === "/api/sample") {
    const content = await readFile(samplePath, "utf8");
    sendJson(res, 200, { filename: "worker-agreement.txt", content });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const body = JSON.parse(await readBody(req));
      if (typeof body.content !== "string" || body.content.trim().length < 40) {
        sendJson(res, 400, { error: "Add a readable document before analyzing." });
        return;
      }
      if (typeof body.question !== "string" || body.question.trim().length < 5) {
        sendJson(res, 400, { error: "Tell us what you want to understand about this document." });
        return;
      }
      if (body.content.length > maxBodyBytes) {
        sendJson(res, 413, { error: "Document is too large. The limit is 1.5 MB." });
        return;
      }
      const document = parseDocument({
        filename: typeof body.filename === "string" ? body.filename : "uploaded-document.txt",
        content: body.content,
      });
      if (!document.chunks.length) {
        sendJson(res, 422, { error: "We could not find readable clauses in that document." });
        return;
      }
      const result = await analyzeQuestion({
        document,
        question: body.question.trim().slice(0, 500),
        language: body.language === "hi" ? "hi" : "en",
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof SyntaxError ? "Invalid request." : error.message });
    }
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res, url.pathname);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  http.createServer(handler).listen(port, () => {
    console.log(`SahiClause running at http://localhost:${port}`);
  });
}

export { handler };
