/*
 * PaperLens Self-Check — UI wiring.
 *
 * PRIVACY: this file never sends the manuscript anywhere. There is no
 * fetch/XHR/WebSocket call in this codebase that carries file bytes or
 * extracted text, no localStorage/sessionStorage/IndexedDB/cookie writes,
 * and no service worker. The manuscript text lives only in the local
 * `currentText` variable below and is discarded on reload — that is the
 * design, not a limitation.
 */

(function () {
  'use strict';

  // Point PDF.js at the locally-bundled worker (no CDN at runtime).
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  }

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

  const downloadReportBtn = document.getElementById('downloadReportBtn');
  const copyAllFixesBtn = document.getElementById('copyAllFixesBtn');

  let currentDraftName = 'draft';
  let lastRunData = null; // { results, score, blockers, warns, infos }

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
  function stripExtension(name) {
    return name.replace(/\.[^./\\]+$/, '');
  }

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

  async function extractPdfText(arrayBuffer) {
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const pageTexts = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      showProgress(`Reading page ${pageNum} of ${pdf.numPages}…`, (pageNum - 1) / pdf.numPages * 100);
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        pageText += item.str;
        pageText += item.hasEOL ? '\n' : ' ';
      }
      pageTexts.push(pageText);
      await yieldToUI();
    }
    showProgress('Finished reading the PDF.', 100);
    return pageTexts.join('\n\n');
  }

  async function handleFile(file) {
    if (!file) return;
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isTxt = /\.txt$/i.test(file.name) || file.type === 'text/plain';
    if (!isPdf && !isTxt) {
      fileNameEl.textContent = 'Please choose a .pdf or .txt file.';
      return;
    }

    currentDraftName = stripExtension(file.name) || 'draft';
    fileNameEl.textContent = `Selected: ${file.name}`;

    try {
      let text;
      if (isPdf) {
        showProgress('Loading PDF…', 0);
        const buf = await readFileAsArrayBuffer(file);
        text = await extractPdfText(buf);
      } else {
        showProgress('Reading file…', 50);
        text = await readFileAsText(file);
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
    currentDraftName = 'draft';
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
    lastRunData = { results, score, blockers, warns, infos };
    renderResults(lastRunData);
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

  function flagCardHtml(flag) {
    const quoteHtml = flag.quote
      ? `<blockquote class="quote">${highlightedQuoteHtml(flag.quote, flag.highlight)}</blockquote>`
      : '';
    return `
      <div class="flag-card ${flag.severity}">
        <div class="card-top">
          <span class="severity-badge ${flag.severity}">${flag.severity}</span>
          <h3>${escapeHtml(flag.title)}</h3>
        </div>
        <p class="explanation">${escapeHtml(flag.explanation)}</p>
        ${quoteHtml}
        <div class="location">Location: ${escapeHtml(friendlyLocation(flag.location))}</div>
        <div class="fix-line">
          <div class="fix-text"><strong>Fix:</strong> ${escapeHtml(flag.fix)}</div>
          <button type="button" class="copy-fix-btn" data-fix="${escapeHtml(flag.fix)}">Copy fix</button>
        </div>
      </div>
    `;
  }

  function renderResults(data) {
    const { results, score, blockers, warns, infos } = data;
    resultsEl.hidden = false;

    scoreNumEl.textContent = String(score);
    countsPlainEl.textContent = `${blockers} blocker${blockers === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}, ${infos} note${infos === 1 ? '' : 's'}`;

    const allFlags = results.flatMap((r) => r.flags);
    const byId = (sev) => allFlags.filter((f) => f.severity === sev);

    blockerGroup.innerHTML = byId('blocker').map(flagCardHtml).join('') ||
      '<p class="empty-note">No blockers found.</p>';
    warnGroup.innerHTML = byId('warn').map(flagCardHtml).join('') ||
      '<p class="empty-note">No warnings found.</p>';
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

  // Clipboard writes can be rejected (permissions, an unfocused document,
  // older browsers); fall back to a hidden-textarea copy so the button
  // always gives the student real feedback instead of failing silently.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error('execCommand copy failed'));
      } catch (e) {
        document.body.removeChild(ta);
        reject(e);
      }
    });
  }

  resultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-fix-btn');
    if (!btn) return;
    const fixText = btn.dataset.fix;
    copyText(fixText).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy fix';
        btn.classList.remove('copied');
      }, 1500);
    }).catch(() => {
      btn.textContent = 'Copy failed — select manually';
      setTimeout(() => { btn.textContent = 'Copy fix'; }, 2000);
    });
  });

  // ---- Export -------------------------------------------------------------
  function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'draft';
  }

  function buildMarkdownReport(data) {
    const { results, score, blockers, warns, infos } = data;
    const lines = [];
    lines.push(`# PaperLens Self-Check report`);
    lines.push('');
    lines.push(`Readiness score: **${score}/100**`);
    lines.push(`(${blockers} blocker${blockers === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}, ${infos} note${infos === 1 ? '' : 's'})`);
    lines.push('');
    lines.push('_This score is a nudge, not a grade — read the full list below before you decide what to fix._');
    lines.push('');

    const section = (title, sev) => {
      const flags = results.flatMap((r) => r.flags).filter((f) => f.severity === sev);
      lines.push(`## ${title}`);
      lines.push('');
      if (flags.length === 0) {
        lines.push(`No ${title.toLowerCase()} found.`);
        lines.push('');
        return;
      }
      flags.forEach((f) => {
        lines.push(`### ${f.title}`);
        lines.push('');
        lines.push(f.explanation);
        lines.push('');
        if (f.quote) lines.push(`> ${f.quote}`);
        lines.push('');
        lines.push(`Location: ${friendlyLocation(f.location)}`);
        lines.push('');
        lines.push(`**Fix:** ${f.fix}`);
        lines.push('');
      });
    };
    section('Blockers', 'blocker');
    section('Warnings', 'warn');
    section('Notes', 'info');

    lines.push('## Checked and clear');
    lines.push('');
    results.filter((r) => r.flags.length === 0).forEach((r) => {
      const message = r.skipped ? r.skipMessage : (r.passMessage || 'No issues found.');
      lines.push(`- **${r.label}:** ${message}`);
    });
    lines.push('');
    lines.push('---');
    lines.push('_Generated entirely in your browser by PaperLens Self-Check. Your draft was never uploaded, stored, or sent anywhere._');

    return lines.join('\n');
  }

  downloadReportBtn.addEventListener('click', () => {
    if (!lastRunData) return;
    const md = buildMarkdownReport(lastRunData);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(currentDraftName)}.report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  copyAllFixesBtn.addEventListener('click', () => {
    if (!lastRunData) return;
    const fixes = lastRunData.results
      .flatMap((r) => r.flags)
      .map((f) => `- ${f.fix}`)
      .join('\n');
    copyText(fixes || 'No fixes needed — nothing was flagged.').then(() => {
      copyAllFixesBtn.textContent = 'Copied!';
      setTimeout(() => { copyAllFixesBtn.textContent = 'Copy all fixes'; }, 1500);
    }).catch(() => {
      copyAllFixesBtn.textContent = 'Copy failed — select manually';
      setTimeout(() => { copyAllFixesBtn.textContent = 'Copy all fixes'; }, 2000);
    });
  });

  selectTab('upload');
})();
