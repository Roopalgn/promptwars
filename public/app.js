const state = { filename: "", content: "" };
const $ = (id) => document.getElementById(id);
const fileInput = $("file-input");
const dropzone = $("dropzone");
const question = $("question");
const analyzeButton = $("analyze-button");

function updateButton() {
  analyzeButton.disabled = !(state.content.trim().length >= 40 && question.value.trim().length >= 5);
}

function setDocument(filename, content) {
  state.filename = filename;
  state.content = content;
  $("file-label").textContent = filename;
  $("file-status").textContent = `${filename} loaded · ${(content.length / 1024).toFixed(1)} KB · ready to search`;
  updateButton();
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 1_500_000) {
    $("file-status").textContent = "That file is over the 1.5 MB limit.";
    return;
  }
  setDocument(file.name, await file.text());
});

["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.style.background = "var(--mint)"; }));
["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.style.background = ""; }));
dropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file) setDocument(file.name, await file.text());
});

$("sample-button").addEventListener("click", async () => {
  $("file-status").textContent = "Loading sample agreement…";
  try {
    const response = await fetch("/api/sample");
    const sample = await response.json();
    setDocument(sample.filename, sample.content);
  } catch {
    $("file-status").textContent = "Could not load the sample. Please upload a document.";
  }
});

document.querySelectorAll(".chip").forEach((chip) => chip.addEventListener("click", () => { question.value = chip.textContent; question.focus(); updateButton(); }));
question.addEventListener("input", updateButton);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function renderResult(data) {
  $("empty-state").hidden = true;
  $("results").hidden = false;
  const badge = $("coverage-badge");
  badge.textContent = data.status === "covered" ? "covered by source" : "not covered";
  badge.classList.toggle("not-covered", data.status !== "covered");
  $("answer-text").textContent = data.answer;
  $("citation-count").textContent = `${data.citations.length} clause${data.citations.length === 1 ? "" : "s"} found in ${data.document.filename}`;
  $("citations").innerHTML = data.citations.length ? data.citations.map((citation) => `<details class="citation"><summary>${escapeHtml(citation.clause)} · page ${citation.page} · ${escapeHtml(citation.heading)}</summary><p>${escapeHtml(citation.excerpt)}</p></details>`).join("") : '<p class="no-flags">No source clause was strong enough to support an answer.</p>';
  $("flag-count").textContent = `${data.redFlags.length} found`;
  $("flags").innerHTML = data.redFlags.length ? data.redFlags.map((flag) => `<article class="flag"><h3>${escapeHtml(flag.title)}</h3><p>${escapeHtml(flag.rationale)}</p><span class="flag-meta">${escapeHtml(flag.severity)} · ${escapeHtml(flag.citation.clause)} · page ${flag.citation.page}</span></article>`).join("") : '<p class="no-flags">No configured pattern matched this document. Keep reading the source clauses closely.</p>';
  $("checklist").innerHTML = data.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("provider").textContent = data.debug.provider;
  $("prompt-debug").textContent = data.debug.prompt;
  $("response-debug").textContent = data.debug.response;
}

analyzeButton.addEventListener("click", async () => {
  analyzeButton.disabled = true;
  analyzeButton.innerHTML = 'Reading the relevant clauses <span aria-hidden="true">…</span>';
  $("form-error").hidden = true;
  try {
    const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: state.filename, content: state.content, question: question.value, language: $("language").value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Analysis failed.");
    renderResult(data);
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("form-error").textContent = error.message;
    $("form-error").hidden = false;
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.innerHTML = 'Analyze my concern <span aria-hidden="true">→</span>';
    updateButton();
  }
});
