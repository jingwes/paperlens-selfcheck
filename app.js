/*
 * PaperLens Self-Check — UI wiring.
 *
 * PRIVACY: this file never sends the manuscript anywhere. There is no
 * fetch/XHR/WebSocket call in this codebase that carries file bytes or
 * extracted text, no localStorage/sessionStorage/IndexedDB/cookie writes,
 * and no service worker. The manuscript text lives only in local variables
 * below and is discarded on reload — that is the design, not a limitation.
 */

(function () {
  'use strict';

  // Point PDF.js at the locally-bundled worker (no CDN at runtime).
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  }

  // Internal severity keys (blocker/warn/info) stay as-is throughout
  // checks.js and scoring; this is only how they're labeled on screen.
  const SEVERITY_LABELS = { blocker: 'major', warn: 'minor', info: 'note' };

  // ---- DOM refs -----------------------------------------------------------
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const tabPanels = {
    upload: document.getElementById('panel-upload'),
    paste: document.getElementById('panel-paste'),
  };

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileNameEl = document.getElementById('fileName');

  const pasteInput = document.getElementById('pasteInput');
  const runPasteBtn = document.getElementById('runPasteBtn');

  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');

  const resultsEl = document.getElementById('results');
  const scoreNumEl = document.getElementById('scoreNum');
  const countsPlainEl = document.getElementById('countsPlain');
  const blockerGroup = document.getElementById('blockerGroup');
  const warnGroup = document.getElementById('warnGroup');
  const infoGroup = document.getElementById('infoGroup');
  const passListEl = document.getElementById('passList');

  // Character ranges for each PDF page in the current manuscript text, so a
  // flag's text offset can be mapped back to "pg. X". Null for pasted/typed
  // text, which has no page concept.
  let currentPageOffsets = null;

  // ---- Tabs -----------------------------------------------------------
  function selectTab(name) {
    tabButtons.forEach((btn) => {
      const isSelected = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    });
    Object.keys(tabPanels).forEach((key) => {
      tabPanels[key].hidden = key !== name;
    });
  }

  tabButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = tabButtons[(idx + dir + tabButtons.length) % tabButtons.length];
        next.focus();
        selectTab(next.dataset.tab);
      }
    });
  });

  // ---- Progress ---------------------------------------------------------
  function showProgress(label, pct) {
    progressWrap.hidden = false;
    progressFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    progressLabel.textContent = label;
  }
  function hideProgress() {
    progressWrap.hidden = true;
    progressFill.style.width = '0%';
  }

  function yieldToUI() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  // ---- File handling ------------------------------------------------------
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  // Returns { text, pageOffsets } — pageOffsets is an array of
  // { page, start, end } character ranges within `text`, one per PDF page,
  // used later to show "(pg. X)" next to a flag's location.
  async function extractPdfText(arrayBuffer) {
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let text = '';
    const pageOffsets = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      showProgress(`Reading page ${pageNum} of ${pdf.numPages}…`, (pageNum - 1) / pdf.numPages * 100);
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }
      const start = text.length;
      text += pageText;
      pageOffsets.push({ page: pageNum, start, end: text.length });
      if (pageNum < pdf.numPages) text += '\n\n';
      await yieldToUI();
    }
    showProgress('Finished reading the PDF.', 100);
    return { text, pageOffsets };
  }

  async function handleFile(file) {
    if (!file) return;
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isTxt = /\.txt$/i.test(file.name) || file.type === 'text/plain';
    if (!isPdf && !isTxt) {
      fileNameEl.textContent = 'Please choose a .pdf or .txt file.';
      return;
    }

    fileNameEl.textContent = `Selected: ${file.name}`;

    try {
      let text;
      if (isPdf) {
        showProgress('Loading PDF…', 0);
        const buf = await readFileAsArrayBuffer(file);
        const extracted = await extractPdfText(buf);
        text = extracted.text;
        currentPageOffsets = extracted.pageOffsets;
      } else {
        showProgress('Reading file…', 50);
        text = await readFileAsText(file);
        currentPageOffsets = null;
      }
      await yieldToUI();
      showProgress('Running checks…', 100);
      runChecks(text);
    } catch (err) {
      fileNameEl.textContent = `Could not read this file locally: ${err.message}`;
    } finally {
      hideProgress();
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    handleFile(file);
    fileInput.value = '';
  });

  runPasteBtn.addEventListener('click', () => {
    const text = pasteInput.value;
    if (!text.trim()) return;
    currentPageOffsets = null;
    showProgress('Running checks…', 100);
    setTimeout(() => {
      runChecks(text);
      hideProgress();
    }, 0);
  });

  // ---- Run checks + render ------------------------------------------------
  function runChecks(text) {
    const { results } = runAllChecks(text, CONFIG);
    const { score, blockers, warns, infos } = scoreResults(results);
    renderResults({ results, score, blockers, warns, infos });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightedQuoteHtml(quote, highlight) {
    const esc = escapeHtml(quote);
    if (!highlight) return esc;
    const escHi = escapeHtml(highlight);
    const idx = esc.toLowerCase().indexOf(escHi.toLowerCase());
    if (idx === -1) return esc;
    return esc.slice(0, idx) + '<mark>' + esc.slice(idx, idx + escHi.length) + '</mark>' + esc.slice(idx + escHi.length);
  }

  function friendlyLocation(loc) {
    if (loc === 'preamble' || loc === '_preamble') return 'before any detected section';
    return loc;
  }

  // Maps a flag's manuscript-text offset to a PDF page number, or null when
  // the source was pasted text (no pages) or the flag has no offset at all
  // (a whole-document absence like "no baseline anywhere").
  function pageForOffset(offset) {
    if (!currentPageOffsets || offset == null) return null;
    for (const p of currentPageOffsets) {
      if (offset >= p.start && offset < p.end) return p.page;
    }
    if (currentPageOffsets.length === 0) return null;
    return offset < currentPageOffsets[0].start
      ? currentPageOffsets[0].page
      : currentPageOffsets[currentPageOffsets.length - 1].page;
  }

  function locationWithPage(flag) {
    const label = friendlyLocation(flag.location);
    const page = pageForOffset(flag.offset);
    return page ? `${label} (pg. ${page})` : label;
  }

  function flagCardHtml(flag) {
    const quoteHtml = flag.quote
      ? `<blockquote class="quote">${highlightedQuoteHtml(flag.quote, flag.highlight)}</blockquote>`
      : '';
    const severityLabel = SEVERITY_LABELS[flag.severity] || flag.severity;
    return `
      <div class="flag-card ${flag.severity}">
        <div class="card-top">
          <span class="severity-badge ${flag.severity}">${escapeHtml(severityLabel)}</span>
          <h3>${escapeHtml(flag.title)}</h3>
        </div>
        <p class="explanation">${escapeHtml(flag.explanation)}</p>
        ${quoteHtml}
        <div class="location">Location: ${escapeHtml(locationWithPage(flag))}</div>
        <div class="fix-line">
          <div class="fix-text"><strong>Fix:</strong> ${escapeHtml(flag.fix)}</div>
        </div>
      </div>
    `;
  }

  function renderResults(data) {
    const { results, score, blockers, warns, infos } = data;
    resultsEl.hidden = false;

    scoreNumEl.textContent = String(score);
    countsPlainEl.textContent = `${blockers} major issue${blockers === 1 ? '' : 's'}, ${warns} minor issue${warns === 1 ? '' : 's'}, ${infos} note${infos === 1 ? '' : 's'}`;

    const allFlags = results.flatMap((r) => r.flags);
    const byId = (sev) => allFlags.filter((f) => f.severity === sev);

    blockerGroup.innerHTML = byId('blocker').map(flagCardHtml).join('') ||
      '<p class="empty-note">No major issues found.</p>';
    warnGroup.innerHTML = byId('warn').map(flagCardHtml).join('') ||
      '<p class="empty-note">No minor issues found.</p>';
    infoGroup.innerHTML = byId('info').map(flagCardHtml).join('') ||
      '<p class="empty-note">No notes.</p>';

    // "Checked and clear" — every check that ran but found nothing to flag,
    // or that did not apply to this manuscript, listed explicitly so the
    // student knows it was checked, not skipped.
    const passItems = results
      .filter((r) => r.flags.length === 0)
      .map((r) => {
        const icon = r.skipped ? '–' : '✓';
        const iconClass = r.skipped ? 'icon skip' : 'icon';
        const message = r.skipped ? r.skipMessage : (r.passMessage || 'No issues found.');
        return `<div class="pass-item"><span class="${iconClass}" aria-hidden="true">${icon}</span><div><span class="check-label">${escapeHtml(r.label)}:</span> ${escapeHtml(message)}</div></div>`;
      })
      .join('');
    passListEl.innerHTML = passItems || '<p class="empty-note">Every check found something to flag above.</p>';

    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  selectTab('upload');
})();
