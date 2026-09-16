# PaperLens Self-Check

A single-page, offline-capable tool that reads a draft manuscript (PDF or pasted
text) and returns a writing-rigor checklist: sample size, uncertainty, named
comparisons, exhibit citations, and overclaiming — the reporting habits that
make a paper believable. The student reviews the flags and fixes their own
draft; nothing is graded or submitted from here.

## Privacy design (non-negotiable, not a placeholder)

- Everything runs in the browser. PDFs are parsed locally with a
  locally-bundled copy of PDF.js (`vendor/pdfjs/`) — there is no CDN call at
  runtime and no network request ever carries the file's bytes or extracted
  text.
- There is no backend, no database, no accounts, no analytics, and no
  telemetry anywhere in this codebase.
- The app never writes to `localStorage`, `sessionStorage`, `IndexedDB`, or
  cookies, and registers no service worker. The manuscript text lives only in
  an in-memory JS variable and is discarded when the page reloads — that is
  the design, not a limitation.
- Verified manually: uploading a 30+ page PDF produces zero network requests
  beyond loading the local `pdf.worker.min.js`, and `localStorage.length`,
  `sessionStorage.length`, `document.cookie`, and `indexedDB.databases()` are
  all empty after a full run.

## Deploying

This is fully static — no build step, no npm install. Push this folder to any
static host and it works as-is:

- **GitHub Pages:** push to a repo, then enable Pages for the branch/folder
  in Settings → Pages. The app is served at
  `https://<user>.github.io/<repo>/`.
- **Netlify / Cloudflare Pages:** point either at this folder with an empty
  build command and `.` as the publish directory.

Opening `index.html` directly from disk (`file://`) also works, since there is
no server-side dependency — some browsers restrict Web Workers on `file://`,
in which case serve the folder with any static file server
(e.g. `python3 -m http.server`) instead.

## Project layout

- `index.html` — page structure, tabs, results markup.
- `styles.css` — all styling, including the print stylesheet.
- `checks.js` — the check engine: `CONFIG`, the 14 checks, section/sentence
  detection, and scoring. Pure functions, no DOM access, so it runs
  identically under Node (for tests) and in the browser.
- `app.js` — UI wiring only: tabs, drag-and-drop, PDF.js integration,
  rendering, and export. Never sends the manuscript anywhere.
- `vendor/pdfjs/` — the PDF.js legacy build (`pdf.min.js` +
  `pdf.worker.min.js`), bundled locally so the tool works fully offline.
- `test/run-tests.js` — a Node self-test suite covering the required
  self-tests (theory papers, abstract/body mismatches, orphaned exhibits,
  missing uncertainty, unbaselined superiority claims). Run with
  `node test/run-tests.js`.
- `test/fixtures/gen_pdf_source.py` — generates a long synthetic manuscript
  used to stress-test PDF parsing performance (not required to run the app).

## Tuning false positives

Every enable/disable flag, cap, threshold, and word list lives in the
`CONFIG` object at the top of `checks.js`. A tutor can change what counts as
a "comparison" or an "overclaim verb", raise or lower the overclaim cap, or
disable a check entirely, without touching any check logic.
