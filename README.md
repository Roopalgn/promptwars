# SahiClause

SahiClause is a clause-grounded legal document navigator for gig workers and first-job employees in India. It helps a person understand the part of an agreement that affects their immediate concern—notice periods, payout deductions, deactivation, exclusivity, and dispute resolution—without pretending to replace a lawyer.

## Why this is viable

The repository is intentionally small and dependency-free: a Node.js HTTP server, a browser client, a versioned red-flag library, and Node's built-in test runner. It can run locally with no API key, which makes the core demo reproducible. If `GEMINI_API_KEY` is configured, the same grounded prompt is sent to Google Gemini; the UI exposes which provider answered. The deterministic local engine remains the safe fallback when the provider is unavailable.

## What it demonstrates

- Upload or load an agreement, then ask a focused question.
- Parse numbered clauses into stable clause/page citation metadata.
- Retrieve only relevant clauses and refuse questions that are not covered.
- Show the source excerpt behind each answer.
- Scan the full agreement against a small, reviewable gig/employment red-flag library.
- Produce an immediate action checklist.
- Switch the generated guidance between English and Hindi.
- Show the exact grounded prompt and response in the transparency panel.

This is a reading aid, not legal advice. The red flags are patterns to review, not legal conclusions.

## Run it

Requires Node.js 20 or newer. No package install is required.

```text
node server.js
```

Open http://localhost:3000. To use Gemini instead of the local grounded engine:

```text
set GEMINI_API_KEY=your-key
node server.js
```

The key is read only from the environment and is never sent to the browser or committed to the repository.

## Test it

```text
node --test
```

The tests cover clause parsing, citation metadata, relevant retrieval, refusal when the document is silent, and red-flag matching.

## Demo path

1. Select **Load a sample worker agreement**.
2. Ask: “What is my notice period if I quit?” and show the clause citation.
3. Ask: “What happens to my stock options if I resign?” and show the intentional refusal.
4. Expand “Worth a closer look” to show mandatory arbitration, broad exclusivity, deductions, and termination patterns.
5. Switch to Hindi and analyze again.
6. Open “See the AI at work” to show the prompt, retrieved clause IDs, and response.

## Assumptions and next steps

The MVP assumes a single text-readable document per session and uses numbered headings as clause anchors. The lightweight PDF reader is a safe fallback for simple text PDFs; a production deployment should add a maintained PDF parser, persistent document sessions, authentication/rate limiting, and professional review of the red-flag taxonomy. Uploaded content is processed in memory and is not persisted.

## Why this is not just a generic chatbot

The differentiator is the workflow: a hard refusal path when the source is silent, clause/page anchors for each supported claim, a curated domain-specific risk scan, and an accessible multilingual output designed for a worker about to sign an agreement.
