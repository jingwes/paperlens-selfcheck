/*
 * PaperLens Self-Check — check engine.
 * Pure functions, no DOM access, so this file can run identically in the
 * browser and under Node (for the test suite in test/run-tests.js).
 *
 * CONFIG below is the single place a tutor should need to touch to tune
 * false positives: enable/disable checks, change caps, thresholds, and the
 * word lists used to detect sample sizes / uncertainty / comparisons / etc.
 */

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const CONFIG = {
  checks: {
    sample_size: true,
    uncertainty_absent: true,
    uncertainty_local: true,
    baseline: true,
    unit_of_analysis: true,
    replicates: true,
    provenance: true,
    abstract_body_number: true,
    figure_orphan: true,
    balance: true,
    abstract_quant: true,
    overclaim: true,
    limitations: true,
    reference_missing: true,
  },

  // Caps (max number of flags a noisy check may raise)
  overclaimMaxFlags: 5,
  uncertaintyLocalMax: 4,
  abstractBodyNumberMax: 4,
  limitationsGenericMax: 3,

  // Rounding tolerance for abstract-vs-body number matching
  abstractNumberTolerance: {
    smallValueThreshold: 1, // values below this use the "small" tolerance
    small: 0.005,
    large: 0.5,
  },

  // Section word-share thresholds (balance checks)
  introShareMax: 0.30, // intro > 30% of core text -> info
  resultsShareMin: 0.15, // results < 15% of core text -> warn
  balanceMinCoreWords: 400, // skip balance checks under this many words

  // Word / phrase lists -----------------------------------------------------
  sampleSizeUnits: [
    'participants', 'subjects', 'patients', 'donors', 'samples', 'cells',
    'images', 'documents', 'reports', 'papers', 'articles', 'recordings',
    'embryos', 'worms', 'mice', 'flies', 'cases', 'trials', 'compounds',
    'molecules', 'structures', 'simulations', 'runs', 'replicates', 'slides',
    'scans', 'teeth', 'specimens', 'tissues', 'genomes', 'variants',
    'configurations', 'instances', 'lattices', 'graphs', 'nodes', 'edges',
    'trajectories', 'prompts', 'questions', 'tasks', 'patches', 'tokens',
    'epochs', 'folds', 'parameter settings',
  ],

  uncertaintyTokens: [
    '95% CI', 'confidence interval', '±', '+/-', 'standard deviation',
    'standard error', 's.d.', 's.e.', 'error bar', 'error bars', 'bootstrap',
    'interquartile', 'IQR', 'range of',
  ],

  comparisonTerms: [
    'compared to', 'compared with', 'compared against', 'baseline',
    'control group', 'vs.', 'vs', 'relative to', 'prior method', 'prior work',
    'existing method', 'state-of-the-art', 'ablation', 'null model',
    'random baseline', 'majority-class', 'majority class',
  ],

  superiorityTerms: [
    'outperform', 'outperforms', 'outperformed', 'outperforming',
    'better than', 'superior to', 'improves over', 'improve over',
    'improved over', 'beats', 'beat', 'exceeds all', 'exceeds existing',
    'exceeds prior',
  ],

  unitOfAnalysisTerms: [
    'biological replicate', 'technical replicate', 'independent experiment',
    'independent sample', 'independent donor', 'independent batch',
    'independent cohort', 'independent dataset', 'independent run',
    'repeated measurements', 'repeated trials', 'repeated runs',
    'paired test',
  ],

  replicateTriggerTerms: [
    'model', 'models', 'training', 'trained', 'classifier', 'classifiers',
    'algorithm', 'algorithms', 'pipeline', 'pipelines', 'simulation',
    'simulations', 'llm', 'llms',
  ],

  replicateRequirementTerms: [
    'random seed', 'fixed seed', 'seeds', 'independent runs',
  ],

  provenanceTriggerTerms: [
    'dataset', 'datasets', 'cohort', 'sequencing', 'screen', 'corpus',
    'records', 'database', 'biobank', 'measurements',
  ],

  provenanceIdentifierTerms: [
    'accession', 'ArrayExpress', 'dbGaP', 'Zenodo', 'GEO', 'TCGA', 'ABCD',
    'UK Biobank', 'downloaded from', 'publicly available', 'available at',
    'doi.org',
  ],

  hedgeScopeTerms: [
    'may', 'might', 'suggests', 'suggest', 'in our sample', 'in our dataset',
    'in our setting', 'preliminary', 'pilot', 'under these conditions',
    'to our knowledge',
  ],

  overclaimVerbs: [
    { term: 'demonstrates', rewrite: 'we observed that' },
    { term: 'demonstrate', rewrite: 'we observed that' },
    { term: 'prove', rewrite: 'we provide evidence that', proofFamily: true },
    { term: 'proves', rewrite: 'we provide evidence that', proofFamily: true },
    { term: 'proved', rewrite: 'we provide evidence that', proofFamily: true },
    { term: 'establishes', rewrite: 'is consistent with' },
    { term: 'enables', rewrite: 'was associated with, in this setting,' },
    { term: 'revolutionizes', rewrite: 'changes how we approach' },
    { term: 'first to', rewrite: 'to our knowledge, the first to' },
    { term: 'novel', rewrite: 'new' },
    { term: 'outperforms all', rewrite: 'outperformed the methods tested' },
    { term: 'solves the', rewrite: 'addresses the' },
    { term: 'definitively', rewrite: 'in the cases tested,' },
    { term: 'conclusively', rewrite: 'in the cases tested,' },
    { term: 'breakthrough', rewrite: 'a meaningful step forward' },
    { term: 'state-of-the-art performance', rewrite: 'competitive performance' },
    { term: 'state-of-the-art results', rewrite: 'competitive results' },
  ],

  theoryTerms: [
    'theorem', 'lemma', 'corollary', 'proof', 'analytical solution',
    'derivation',
  ],
  theoryTermMinCount: 5,

  limitationsTriggerTerms: [
    'limitation', 'limitations', 'we did not', 'not tested',
    'cannot rule out',
  ],

  limitationsGenericTerms: [
    'more data', 'larger sample', 'larger dataset', 'larger cohort',
    'further study is needed', 'further studies are needed',
    'due to time constraints', 'due to computational constraints',
    'beyond the scope of this', 'was not feasible', 'limited by time',
  ],

  sectionHeadings: [
    { name: 'abstract', patterns: ['abstract'] },
    { name: 'introduction', patterns: ['introduction'] },
    { name: 'methods', patterns: ['methods', 'materials and methods', 'materials & methods'] },
    { name: 'results', patterns: ['results'] },
    { name: 'discussion', patterns: ['discussion'] },
    // A combined heading (common in journals) is registered under BOTH
    // names, pointing at the same section text, instead of matching
    // neither "results" nor "discussion" and leaving both empty.
    { name: ['results', 'discussion'], patterns: ['results and discussion', 'results & discussion', 'discussion and results'] },
    { name: 'conclusion', patterns: ['conclusion', 'conclusions'] },
    { name: 'limitations', patterns: ['limitations'] },
    { name: 'future work', patterns: ['future work'] },
    { name: 'references', patterns: ['references', 'bibliography'] },
    { name: 'acknowledgements', patterns: ['acknowledgements', 'acknowledgments'] },
  ],
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenToPattern(tok) {
  const esc = escapeRegex(tok);
  const startsWord = /^[a-zA-Z0-9]/.test(tok);
  const endsWord = /[a-zA-Z0-9]$/.test(tok);
  return (startsWord ? '\\b' : '') + esc + (endsWord ? '\\b' : '');
}

function buildAltRegex(tokens, flags) {
  return new RegExp('(?:' + tokens.map(tokenToPattern).join('|') + ')', flags || 'i');
}

function countMatches(regex, text) {
  const g = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  const m = text.match(g);
  return m ? m.length : 0;
}

const DECIMAL_PERCENT_SRC = "\\b\\d+\\.\\d+%?\\b|\\b\\d+%\\b";
function hasDecimalOrPercent(text) {
  return new RegExp(DECIMAL_PERCENT_SRC).test(text);
}
function allDecimalOrPercent(text) {
  return text.match(new RegExp(DECIMAL_PERCENT_SRC, 'g')) || [];
}
const CITATION_RE = /\[\d+(?:\s*[,-]\s*\d+)*\]|\([A-Z][A-Za-z'-]+(?:\s+(?:et al\.?|and\s+[A-Z][A-Za-z'-]+))?,?\s*\d{4}[a-z]?\)/;
// A figure/table citation in the same sentence (e.g. "(Fig. 3a)") counts as
// evidence for the overclaim check, same as a number or an author-year cite —
// a claim backed by an image or table is not unsupported just because the
// support isn't a statistic.
const FIGURE_TABLE_REF_RE = /\b(?:Figure|Fig\.?|Table|Extended Data Figure)\s*\d+[a-z]?\b/i;
const P_VALUE_RE = /p\s*[<≤]\s*0?\.05/i;
const FROM_TO_RE = /\bfrom\s+-?\d+(?:\.\d+)?\s+to\s+-?\d+(?:\.\d+)?\b/i;
const N_EQUALS_RE = /\bn\s*=\s*\d+\b/i;
const DOI_RE = /doi\.org/i;
const VERSION_RE = /\bversion\s+\d+(\.\d+)?\b|\bv\d+\.\d+\b/i;
const GENOME_BUILD_RE = /\b(hg19|hg38|GRCh3\d|GRCm3\d)\b/i;
const GSE_RE = /\bGSE\d+\b/i;

// ---------------------------------------------------------------------------
// Sentence splitting with character offsets
// ---------------------------------------------------------------------------
function splitSentences(text, forcedBreaks) {
  const sentences = [];
  const abbrevSet = new Set([
    'fig', 'figs', 'eq', 'eqs', 'e.g', 'i.e', 'al', 'dr', 'mr', 'mrs', 'ms',
    'prof', 'no', 'vs', 'approx', 'ref', 'refs', 'vol', 'pp', 'st', 'sec',
    'ch', 'etc',
  ]);
  const breaks = new Set(forcedBreaks || []);
  let start = 0;
  const n = text.length;

  const pushSentence = (rawStart, rawEnd) => {
    const raw = text.slice(rawStart, rawEnd);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const leadWs = raw.length - raw.replace(/^\s+/, '').length;
    const trailWs = raw.length - raw.replace(/\s+$/, '').length;
    sentences.push({
      text: trimmed,
      start: rawStart + leadWs,
      end: rawEnd - trailWs,
    });
  };

  for (let i = 0; i < n; i++) {
    // A section-heading boundary (e.g. the line break after "Abstract" or
    // before "Introduction") always ends the current sentence, even without
    // punctuation — otherwise a heading word glues onto the next paragraph
    // and every sentence in the paper ends up mis-attributed to "preamble".
    if (breaks.has(i + 1)) {
      pushSentence(start, i + 1);
      start = i + 1;
      continue;
    }
    const c = text[i];
    if (c === '.' || c === '!' || c === '?') {
      const prevChar = text[i - 1];
      const nextChar = text[i + 1];
      if (c === '.' && prevChar && /\d/.test(prevChar) && nextChar && /\d/.test(nextChar)) {
        continue;
      }
      let j = i - 1;
      while (j >= 0 && /[A-Za-z]/.test(text[j])) j--;
      const word = text.slice(j + 1, i).toLowerCase();
      if (c === '.' && abbrevSet.has(word)) continue;

      let k = i + 1;
      while (k < n && /[ \t]/.test(text[k])) k++;
      const nextNonSpace = text[k];
      if (nextNonSpace && /[a-z0-9]/.test(nextNonSpace)) continue;

      pushSentence(start, i + 1);
      start = i + 1;
    }
  }
  if (start < n) pushSentence(start, n);
  return sentences;
}

// ---------------------------------------------------------------------------
// Section detection
// ---------------------------------------------------------------------------
function detectSections(text) {
  const lines = [];
  {
    let idx = 0;
    text.split('\n').forEach((lineText) => {
      lines.push({ text: lineText, start: idx });
      idx += lineText.length + 1;
    });
  }

  const headingMatches = [];
  for (const line of lines) {
    const trimmed = line.text.trim();
    if (!trimmed || trimmed.length > 60) continue;
    const cleaned = trimmed
      .replace(/^[\d.\s]+/, '')
      .replace(/[:.\s]+$/, '')
      .toLowerCase()
      .trim();
    for (const heading of CONFIG.sectionHeadings) {
      if (heading.patterns.includes(cleaned)) {
        headingMatches.push({
          // A heading can map to more than one canonical name (a combined
          // "Results and Discussion" heading registers under both).
          names: Array.isArray(heading.name) ? heading.name : [heading.name],
          lineStart: line.start,
          headingEnd: line.start + line.text.length + 1,
        });
        break;
      }
    }
  }

  const sections = {};
  for (let i = 0; i < headingMatches.length; i++) {
    const cur = headingMatches[i];
    const next = headingMatches[i + 1];
    const end = next ? next.lineStart : text.length;
    const body = text.slice(cur.headingEnd, end);
    // All names for a combined heading share the same underlying section
    // object (not just equal content) so a word count computed from one
    // name isn't double-counted as if it were separate text from another.
    const sectionObj = { start: cur.headingEnd, end, text: body };
    for (const nm of cur.names) {
      if (!sections[nm]) {
        sections[nm] = sectionObj;
      } else {
        sections[nm] = { start: sections[nm].start, end, text: sections[nm].text + '\n' + body };
      }
    }
  }

  const preambleEnd = headingMatches.length ? headingMatches[0].lineStart : text.length;
  sections._preamble = { start: 0, end: preambleEnd, text: text.slice(0, preambleEnd) };

  return { sections, headingMatches };
}

// A numbered subsection heading (e.g. "3.1 Statistical analysis", "2.3.1
// Image acquisition") isn't a canonical section name, so detectSections
// leaves it as ordinary text — and its leading "3.1" then reads as a
// decimal value that needs a spread. Blank out just the numbering (keeping
// the title text and preserving every character offset) before any
// decimal/percentage scanning happens. The lookahead requires the number to
// start a line and be followed by a capitalized word, which real data
// values essentially never are.
const OUTLINE_NUMBERING_RE = /^([ \t]*)(\d{1,2}(?:\.\d{1,2}){1,3})(\.?)(?=[ \t]+[A-Z])/gm;
function stripOutlineNumbering(text) {
  return text.replace(OUTLINE_NUMBERING_RE, (match, lead, num, trailDot) => lead + ' '.repeat(num.length + trailDot.length));
}

function locateSentence(sentence, sections) {
  for (const name of Object.keys(sections)) {
    if (name === '_preamble') continue;
    const sec = sections[name];
    if (sentence.start >= sec.start && sentence.start < sec.end) return name;
  }
  return 'preamble';
}

// ---------------------------------------------------------------------------
// Build analysis context shared by all checks
// ---------------------------------------------------------------------------
function buildContext(rawText, config) {
  const text = stripOutlineNumbering(rawText);
  const { sections, headingMatches } = detectSections(text);
  const forcedBreaks = [];
  for (const m of headingMatches) {
    forcedBreaks.push(m.lineStart, m.headingEnd);
  }
  const sentences = splitSentences(text, forcedBreaks).map((s) => ({
    ...s,
    section: locateSentence(s, sections),
  }));
  return { text, sections, sentences, config };
}

function isTheoryPaper(ctx) {
  const theoryCount = ctx.config.theoryTerms.reduce(
    (sum, term) => sum + countMatches(buildAltRegex([term], 'gi'), ctx.text),
    0
  );
  if (theoryCount < ctx.config.theoryTermMinCount) return false;
  const unitRegex = buildAltRegex(ctx.config.sampleSizeUnits, 'i');
  const hasDataWords = unitRegex.test(ctx.text) || /\bdatasets?\b/i.test(ctx.text);
  return !hasDataWords;
}

function sentencesInSections(ctx, names) {
  return ctx.sentences.filter((s) => names.includes(s.section));
}

// Text of the sentence at `index` plus its immediate same-section
// neighbors. Real writing often states evidence — a figure citation, an
// n/SD caveat — one sentence away from the claim or number it supports
// ("Figure 2 shows X. Y was elevated.", or a trailing caption sentence with
// "(n = 3, mean ± SD)"), not repeated in every sentence. Restricting to the
// same section keeps this from reaching into unrelated context.
function nearbySentenceText(ctx, index, radius) {
  const sentences = ctx.sentences;
  const cur = sentences[index];
  let combined = cur.text;
  for (let d = 1; d <= radius; d++) {
    const prev = sentences[index - d];
    if (prev && prev.section === cur.section) combined = prev.text + ' ' + combined;
    const next = sentences[index + d];
    if (next && next.section === cur.section) combined = combined + ' ' + next.text;
  }
  return combined;
}

function makeFlag(checkId, severity, title, explanation, quote, highlight, location, fix, offset) {
  return {
    checkId, severity, title, explanation, quote: quote || null, highlight: highlight || null,
    location: location || 'entire manuscript', fix,
    // Character offset of the flagged sentence/line in the full manuscript
    // text, when one exists. The UI maps this to a PDF page number; null
    // means the flag is about the whole document (e.g. "no baseline
    // anywhere"), which has no single page to point to.
    offset: offset != null ? offset : null,
  };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

// 1. sample_size
function check_sample_size(ctx) {
  const id = 'sample_size';
  const unitAlt = ctx.config.sampleSizeUnits.map(escapeRegex).join('|');
  const re = new RegExp('\\bn\\s*=\\s*\\d+\\b|\\b\\d+(?:\\.\\d+)?\\s*(?:' + unitAlt + ')\\b', 'i');
  const found = re.test(ctx.text);
  if (found) {
    return { id, flags: [], passMessage: 'The manuscript states how many units were analyzed.' };
  }
  if (isTheoryPaper(ctx)) {
    return {
      id,
      flags: [makeFlag(
        id, 'warn', 'System sizes not stated',
        'This reads like a theory or analysis paper — readers still need to know the scale of what you analyzed to judge generality.',
        null, null, 'entire manuscript',
        'State the sizes of the systems analyzed (e.g., lattice dimensions, graph or instance counts, ensemble sizes).'
      )],
    };
  }
  return {
    id,
    flags: [makeFlag(
      id, 'blocker', 'Sample size not stated',
      "A reader can't judge how much evidence supports a claim without knowing how many units were analyzed.",
      null, null, 'entire manuscript',
      "Add n in Methods (e.g., 'n = 42 participants') and repeat that number in the Abstract."
    )],
  };
}

// 2. uncertainty_absent
function check_uncertainty_absent(ctx) {
  const id = 'uncertainty_absent';
  const tokenRe = buildAltRegex(ctx.config.uncertaintyTokens, 'i');
  const found = tokenRe.test(ctx.text) || P_VALUE_RE.test(ctx.text) || FROM_TO_RE.test(ctx.text);
  if (found) {
    return { id, flags: [], passMessage: 'The manuscript reports a spread or interval on at least one number.' };
  }
  return {
    id,
    flags: [makeFlag(
      id, 'blocker', 'No uncertainty reported anywhere',
      'A number without a spread tells a reader nothing about how reliable it is.',
      null, null, 'entire manuscript',
      'Report a spread on the headline number: mean ± s.d. over 3+ runs, or a 95% confidence interval.'
    )],
  };
}

// 3. uncertainty_local
function check_uncertainty_local(ctx) {
  const id = 'uncertainty_local';
  const tokenRe = buildAltRegex(ctx.config.uncertaintyTokens, 'i');
  const flags = [];
  for (let i = 0; i < ctx.sentences.length; i++) {
    if (flags.length >= ctx.config.uncertaintyLocalMax) break;
    const s = ctx.sentences[i];
    if (!['results', 'abstract'].includes(s.section)) continue;
    if (!hasDecimalOrPercent(s.text)) continue;
    // A caption or the next/previous sentence often carries the spread
    // ("... 0.85 colocalization. Figure 2: n = 3 independent experiments,
    // mean ± SD.") rather than repeating it in the sentence with the number.
    const windowText = nearbySentenceText(ctx, i, 1);
    const hasUncertainty = tokenRe.test(windowText) || P_VALUE_RE.test(windowText) || FROM_TO_RE.test(windowText);
    if (hasUncertainty) continue;
    const m = allDecimalOrPercent(s.text);
    flags.push(makeFlag(
      id, 'warn', 'Number reported without its spread',
      'A single number without a spread hides how much it might vary from sample to sample.',
      s.text, m ? m[0] : null, s.section,
      'Attach the spread to this specific number (± s.d., a 95% CI, or a range) — either right here or in the figure/table caption it comes from.',
      s.start
    ));
  }
  if (flags.length === 0) {
    return { id, flags: [], passMessage: 'Numbers in the Results and Abstract carry a spread or interval.' };
  }
  return { id, flags };
}

// 4. baseline_missing / baseline_weak
function check_baseline(ctx) {
  const id = 'baseline';
  const candidates = sentencesInSections(ctx, ['results', 'discussion', 'abstract']);
  const superiorityRe = buildAltRegex(ctx.config.superiorityTerms, 'i');
  const exceedsAllRe = /\bexceeds\s+(all|existing|prior)\b/i;
  const comparisonRe = buildAltRegex(ctx.config.comparisonTerms, 'i');
  const hasComparisonAnywhere = comparisonRe.test(ctx.text);

  let superioritySentence = null;
  for (const s of candidates) {
    if (superiorityRe.test(s.text) || exceedsAllRe.test(s.text)) { superioritySentence = s; break; }
  }

  if (hasComparisonAnywhere) {
    return { id, flags: [], passMessage: 'The manuscript names a comparison or baseline somewhere.' };
  }

  if (superioritySentence) {
    const m = superioritySentence.text.match(superiorityRe) || superioritySentence.text.match(exceedsAllRe);
    return {
      id,
      flags: [makeFlag(
        id, 'blocker', 'Superiority claimed without a named comparison',
        "This sentence claims your method is better without saying better than what, so a reader can't check the comparison.",
        superioritySentence.text, m ? m[0] : null, superioritySentence.section,
        "Name the comparator and give its number (e.g., 'vs. 0.71 for the random baseline'), or drop the comparative wording.",
        superioritySentence.start
      )],
    };
  }

  return {
    id,
    flags: [makeFlag(
      id, 'warn', 'No comparison or baseline mentioned',
      'Without a point of comparison, a reader has no way to judge whether a result is good.',
      null, null, 'entire manuscript',
      'Add a baseline, control group, or prior-work comparison, even a simple one (random or majority-class).'
    )],
  };
}

// 5. unit_of_analysis
function check_unit_of_analysis(ctx) {
  const id = 'unit_of_analysis';
  const re = buildAltRegex(ctx.config.unitOfAnalysisTerms, 'i');
  const perRe = /\bper\s+\w+/i;
  const found = re.test(ctx.text) || perRe.test(ctx.text);
  if (found) {
    return { id, flags: [], passMessage: 'The manuscript states what one data point represents.' };
  }
  return {
    id,
    flags: [makeFlag(
      id, 'warn', 'Unit of analysis not defined',
      "It's unclear what one data point represents (one animal? one image? one measurement?), which changes how the numbers should be read.",
      null, null, 'entire manuscript',
      "State once what one data point represents, e.g. 'each point is one independent biological replicate.'"
    )],
  };
}

// 6. replicates
function check_replicates(ctx) {
  const id = 'replicates';
  const triggerRe = buildAltRegex(ctx.config.replicateTriggerTerms, 'i');
  const relevant = sentencesInSections(ctx, ['methods', 'results']).map((s) => s.text).join(' ');
  if (!triggerRe.test(relevant)) {
    return { id, flags: [], skipped: true, skipMessage: 'No model/training/simulation language detected in Methods or Results — this check does not apply.' };
  }
  const reqRe = buildAltRegex(ctx.config.replicateRequirementTerms, 'i');
  const acrossRe = /\bacross\s+\d+\s+(?:runs|seeds|replicates|folds)\b/i;
  const nRunsRe = /\bn\s*=\s*\d+\s*runs\b/i;
  const found = reqRe.test(ctx.text) || acrossRe.test(ctx.text) || nRunsRe.test(ctx.text);
  if (found) {
    return { id, flags: [], passMessage: 'The manuscript reports seeds or a run count for its models/simulations.' };
  }
  return {
    id,
    flags: [makeFlag(
      id, 'warn', 'No seed or run-count reported',
      'Without knowing how many independent runs were used, a reader cannot tell if a result is stable or a lucky seed.',
      null, null, 'entire manuscript',
      'Report the number of independent runs (or seeds) and the spread of the result across them.'
    )],
  };
}

// 7. provenance
function check_provenance(ctx) {
  const id = 'provenance';
  const triggerRe = buildAltRegex(ctx.config.provenanceTriggerTerms, 'i');
  if (!triggerRe.test(ctx.text)) {
    return { id, flags: [], skipped: true, skipMessage: 'No dataset/cohort language detected — this check does not apply.' };
  }
  const identifierRe = buildAltRegex(ctx.config.provenanceIdentifierTerms, 'i');
  const found = identifierRe.test(ctx.text) || GSE_RE.test(ctx.text) || DOI_RE.test(ctx.text)
    || VERSION_RE.test(ctx.text) || GENOME_BUILD_RE.test(ctx.text);
  if (found) {
    return { id, flags: [], passMessage: 'The manuscript names a dataset identifier, version, or access point.' };
  }
  return {
    id,
    flags: [makeFlag(
      id, 'warn', 'Data source not identified',
      'A reader (or grader) cannot check your data without knowing what it is, which version, and where to get it.',
      null, null, 'entire manuscript',
      'Name the dataset, its version or accession number, and how to obtain it.'
    )],
  };
}

// 8. abstract_body_number
function check_abstract_body_number(ctx) {
  const id = 'abstract_body_number';
  const abstract = ctx.sections.abstract;
  if (!abstract || !abstract.text.trim()) {
    return { id, flags: [], skipped: true, skipMessage: 'No Abstract section detected — this check does not apply.' };
  }
  const abstractSentences = ctx.sentences.filter((s) => s.section === 'abstract');
  const bodyText = ctx.sentences.filter((s) => s.section !== 'abstract').map((s) => s.text).join(' \n ');

  const tol = ctx.config.abstractNumberTolerance;
  const flags = [];

  for (const s of abstractSentences) {
    if (flags.length >= ctx.config.abstractBodyNumberMax) break;
    const matches = allDecimalOrPercent(s.text);
    if (matches.length === 0) continue;
    for (const raw of matches) {
      if (flags.length >= ctx.config.abstractBodyNumberMax) break;
      const isPercent = raw.endsWith('%');
      const value = parseFloat(raw);
      const tolerance = Math.abs(value) < tol.smallValueThreshold ? tol.small : tol.large;

      const bodyNums = allDecimalOrPercent(bodyText);
      const matchInBody = bodyNums.some((bn) => {
        if (bn.endsWith('%') !== isPercent) return false;
        return Math.abs(parseFloat(bn) - value) <= tolerance;
      });

      if (!matchInBody) {
        flags.push(makeFlag(
          id, 'warn', 'Abstract number not found in the body',
          "This number in the Abstract doesn't appear (even after rounding) anywhere in the body, so a reader can't verify it.",
          s.text, raw, 'abstract',
          `Quote the body value exactly (search Results for the number this refers to), or explain how ${raw} was aggregated from the body numbers.`,
          s.start
        ));
      }
    }
  }

  if (flags.length === 0) {
    return { id, flags: [], passMessage: 'Every number in the Abstract also appears in the body, within rounding.' };
  }
  return { id, flags };
}

// 9. figure_orphan
function check_figure_orphan(ctx) {
  const id = 'figure_orphan';
  const lines = ctx.text.split('\n');
  const types = [
    // The trailing [a-z]? allows sub-panel references (Fig. 3a, Fig 3b) to
    // still count as citing the figure as a whole (Figure 3) — a digit
    // followed by a letter has no \b between them, so without this the
    // number alone would never match.
    { key: 'Figure', re: /^\s*(?:Figure|Fig\.)\s*(\d+)[a-z]?\b/i, citeRe: /\b(?:Figure|Fig\.?)\s*(\d+)[a-z]?\b/gi },
    { key: 'Table', re: /^\s*Table\s*(\d+)[a-z]?\b/i, citeRe: /\bTable\s*(\d+)[a-z]?\b/gi },
    { key: 'Extended Data Figure', re: /^\s*Extended Data Figure\s*(\d+)[a-z]?\b/i, citeRe: /\bExtended Data Figure\s*(\d+)[a-z]?\b/gi },
  ];

  const flags = [];
  let anyCaptionsFound = false;

  for (const type of types) {
    const captionLineIdx = new Set();
    const captionNums = new Map(); // num -> {lineIdx, section}
    lines.forEach((line, idx) => {
      const m = line.match(type.re);
      if (m) {
        captionLineIdx.add(idx);
        captionNums.set(m[1], idx);
      }
    });
    if (captionNums.size === 0) continue;
    anyCaptionsFound = true;

    const citedNums = new Set();
    lines.forEach((line, idx) => {
      if (captionLineIdx.has(idx)) return;
      let cm;
      const re = new RegExp(type.citeRe.source, type.citeRe.flags);
      while ((cm = re.exec(line)) !== null) citedNums.add(cm[1]);
    });

    for (const [num, lineIdx] of captionNums.entries()) {
      if (citedNums.has(num)) continue;
      let offset = 0;
      for (let i = 0; i < lineIdx; i++) offset += lines[i].length + 1;
      const section = locateSentence({ start: offset }, ctx.sections);
      flags.push(makeFlag(
        id, 'warn', `${type.key} ${num} is never cited in the text`,
        'An exhibit nobody refers to leaves the reader guessing why it is there and what it shows.',
        lines[lineIdx].trim(), num, section,
        `Cite ${type.key} ${num} at the sentence that uses it, or move it to supplementary material.`,
        offset
      ));
    }
  }

  if (!anyCaptionsFound) {
    return { id, flags: [], skipped: true, skipMessage: 'No figure or table captions detected — this check does not apply.' };
  }
  if (flags.length === 0) {
    return { id, flags: [], passMessage: 'No uncited exhibits found — every figure and table is referenced in the text.' };
  }
  return { id, flags };
}

// 10. balance_intro / balance_results
function check_balance(ctx) {
  const id = 'balance';
  const wc = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const parts = ['introduction', 'methods', 'results', 'discussion', 'conclusion'];
  const counts = {};
  let core = 0;
  // A combined heading (e.g. "Results and Discussion") shares one section
  // object across two names; count its words toward `core` once, not twice.
  const countedSections = new Set();
  for (const p of parts) {
    const sec = ctx.sections[p];
    counts[p] = sec ? wc(sec.text) : 0;
    if (sec && !countedSections.has(sec)) {
      countedSections.add(sec);
      core += counts[p];
    }
  }
  if (core < ctx.config.balanceMinCoreWords) {
    return { id, flags: [], skipped: true, skipMessage: 'Core sections are under 400 words — balance check skipped for such a short draft.' };
  }
  const flags = [];
  const introShare = counts.introduction / core;
  const resultsShare = counts.results / core;
  if (introShare > ctx.config.introShareMax) {
    flags.push(makeFlag(
      id, 'info', 'Introduction takes up a large share of the paper',
      `The Introduction is ${Math.round(introShare * 100)}% of the core text; readers are here for what you found, not another literature review.`,
      null, null, 'introduction',
      'Trim background that is not needed to understand your specific result, and move some to Discussion if it is really about interpretation.'
    ));
  }
  if (resultsShare < ctx.config.resultsShareMin) {
    flags.push(makeFlag(
      id, 'warn', 'Results section is thin relative to the rest of the paper',
      `Results is only ${Math.round(resultsShare * 100)}% of the core text, which suggests the paper is under-reporting what was actually found.`,
      null, null, 'results',
      'Expand Results with the specific numbers, comparisons, and figures that support your claims.'
    ));
  }
  if (flags.length === 0) {
    return { id, flags: [], passMessage: 'Section lengths are reasonably balanced (Introduction is not oversized, Results is not thin).' };
  }
  return { id, flags };
}

// 11. abstract_number / abstract_scope
function check_abstract_quant(ctx) {
  const id = 'abstract_quant';
  const abstract = ctx.sections.abstract;
  if (!abstract || !abstract.text.trim()) {
    return { id, flags: [], skipped: true, skipMessage: 'No Abstract section detected — this check does not apply.' };
  }
  const flags = [];
  const hasNumber = hasDecimalOrPercent(abstract.text);
  if (!hasNumber) {
    flags.push(makeFlag(
      id, 'warn', 'Abstract has no quantitative result',
      'A reader scanning only the Abstract has no number to judge the size or strength of your finding.',
      abstract.text.trim().slice(0, 300), null, 'abstract',
      'State the headline number in the Abstract (with its spread), not just a qualitative description.',
      abstract.start
    ));
  }
  const comparisonRe = buildAltRegex(ctx.config.comparisonTerms, 'i');
  const hedgeRe = buildAltRegex(ctx.config.hedgeScopeTerms, 'i');
  if (!comparisonRe.test(abstract.text) && !hedgeRe.test(abstract.text)) {
    flags.push(makeFlag(
      id, 'info', 'Abstract states no scope or comparison',
      'Without a comparator or a scope hedge, the Abstract reads as a universal claim, which is rarely what one study actually supports.',
      abstract.text.trim().slice(0, 300), null, 'abstract',
      "Add a scope phrase (e.g. 'in our sample', 'preliminary evidence suggests') or name what the result is compared against.",
      abstract.start
    ));
  }
  if (flags.length === 0) {
    return { id, flags: [], passMessage: 'The Abstract states a quantitative result with an appropriate scope or comparison.' };
  }
  return { id, flags };
}

// 12. overclaim
function check_overclaim(ctx) {
  const id = 'overclaim';
  const theory = isTheoryPaper(ctx);
  const hedgeRe = buildAltRegex(ctx.config.hedgeScopeTerms, 'i');
  const flags = [];

  for (let i = 0; i < ctx.sentences.length; i++) {
    if (flags.length >= ctx.config.overclaimMaxFlags) break;
    const s = ctx.sentences[i];
    let matchedVerb = null;
    for (const v of ctx.config.overclaimVerbs) {
      if (theory && v.proofFamily) continue;
      const re = buildAltRegex([v.term], 'i');
      if (re.test(s.text)) { matchedVerb = v; break; }
    }
    if (!matchedVerb) continue;

    // A citation or figure/table reference often sits in the sentence
    // right before or after the claim it supports ("Figure 2 shows X.
    // This demonstrates..."), not repeated in the claim's own sentence.
    const windowText = nearbySentenceText(ctx, i, 1);
    const hasNumber = hasDecimalOrPercent(s.text);
    const hasCitation = CITATION_RE.test(windowText) || FIGURE_TABLE_REF_RE.test(windowText);
    const hasHedge = hedgeRe.test(s.text);
    if (hasNumber || hasCitation || hasHedge) continue;

    flags.push(makeFlag(
      id, 'warn', 'Strong claim without nearby evidence',
      `The word "${matchedVerb.term}" asserts a strong conclusion, but neither this sentence nor its neighbors cite a number, a source, or a figure/table to back it up.`,
      s.text, matchedVerb.term, s.section,
      `Try a calibrated rewrite: replace "${matchedVerb.term}" with "${matchedVerb.rewrite}", and cite the supporting number, source, or figure/table.`,
      s.start
    ));
  }

  if (flags.length === 0) {
    return { id, flags: [], passMessage: 'Strong claims in the manuscript are backed by a number, citation, or figure/table reference nearby.' };
  }
  return { id, flags };
}

// 13. limitations_absent / limitations_generic
function check_limitations(ctx) {
  const id = 'limitations';
  const relevantSectionNames = ['limitations', 'discussion', 'conclusion', 'future work'];

  // Join the candidate sections into one search string, but remember where
  // each segment came from so a match's index can be traced back to a real
  // offset (and section) in the original manuscript, not just "discussion".
  const segments = [];
  let relevantText = '';
  for (const name of relevantSectionNames) {
    const sec = ctx.sections[name];
    if (!sec) continue;
    const segStart = relevantText.length;
    relevantText += sec.text;
    segments.push({ start: segStart, end: relevantText.length, sectionStart: sec.start, name });
    relevantText += ' ';
  }
  function locate(indexInRelevantText) {
    for (const seg of segments) {
      if (indexInRelevantText >= seg.start && indexInRelevantText < seg.end) {
        return { offset: seg.sectionStart + (indexInRelevantText - seg.start), section: seg.name };
      }
    }
    return { offset: null, section: 'discussion' };
  }

  const triggerRe = buildAltRegex(ctx.config.limitationsTriggerTerms, 'i');
  const flags = [];

  if (!triggerRe.test(relevantText)) {
    const firstSeg = segments[0];
    flags.push(makeFlag(
      id, 'warn', 'No limitations discussed',
      'Every method has a scope where it does not apply; not naming it makes the reader do that work, or trust the claim blindly.',
      null, null, firstSeg ? firstSeg.name : 'discussion',
      'Add a short paragraph: what this test cannot detect, what result would have refuted your claim, and the cheapest experiment that would settle the biggest remaining doubt.',
      firstSeg ? firstSeg.sectionStart : null
    ));
  }

  const genericRe = buildAltRegex(ctx.config.limitationsGenericTerms, 'gi');
  let m;
  const seen = new Set();
  const localRe = new RegExp(genericRe.source, 'gi');
  while ((m = localRe.exec(relevantText)) !== null) {
    if (flags.filter((f) => f.title.includes('generic')).length >= ctx.config.limitationsGenericMax) break;
    const key = m[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { offset, section } = locate(m.index);
    flags.push(makeFlag(
      id, 'info', 'Limitation stated as a generic resource complaint',
      `"${m[0]}" describes a constraint on you, not a limit of the claim — it doesn't tell the reader what might be wrong with the result.`,
      null, m[0], section,
      'Name the specific claim this affects and the specific test that is missing, instead of a generic resource complaint.',
      offset
    ));
  }

  if (flags.length === 0) {
    return { id, flags: [], passMessage: 'The manuscript states specific, non-generic limitations.' };
  }
  return { id, flags };
}

// 14. reference_missing
function check_reference_missing(ctx) {
  const id = 'reference_missing';
  const refs = ctx.sections.references;
  if (!refs || !refs.text.trim()) {
    return { id, flags: [], skipped: true, skipMessage: 'No References section detected — this check does not apply.' };
  }
  const refNums = new Set();
  const entryRe = /^\s*\[?(\d+)\]?[.)]?\s+\S/gm;
  let m;
  while ((m = entryRe.exec(refs.text)) !== null) refNums.add(m[1]);

  const bodyText = ctx.text.slice(0, refs.start);
  const citeRe = /\[(\d+(?:\s*[,-]\s*\d+)*)\]/g;
  const citedNums = new Set();
  while ((m = citeRe.exec(bodyText)) !== null) {
    m[1].split(/\s*,\s*/).forEach((part) => {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        for (let i = a; i <= b; i++) citedNums.add(String(i));
      } else {
        citedNums.add(part.trim());
      }
    });
  }

  const missing = [...citedNums].filter((n) => !refNums.has(n));
  if (refNums.size === 0) {
    return { id, flags: [], skipped: true, skipMessage: 'Could not parse numbered entries in the References section — this check does not apply.' };
  }
  if (missing.length === 0) {
    return { id, flags: [], passMessage: 'Every in-text citation number has a matching entry in References.' };
  }
  const flags = missing.sort((a, b) => Number(a) - Number(b)).map((n) => makeFlag(
    id, 'warn', `Citation [${n}] has no matching reference entry`,
    'A citation number with no matching entry leaves the reader unable to check the source.',
    null, `[${n}]`, 'references',
    `Add reference [${n}] to the References list, or fix the citation number if it was mistyped.`
  ));
  return { id, flags };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
const CHECKS = [
  { id: 'sample_size', label: 'Sample size stated', run: check_sample_size },
  { id: 'uncertainty_absent', label: 'Uncertainty reported anywhere', run: check_uncertainty_absent },
  { id: 'uncertainty_local', label: 'Uncertainty attached to specific numbers', run: check_uncertainty_local },
  { id: 'baseline', label: 'Comparison / baseline named', run: check_baseline },
  { id: 'unit_of_analysis', label: 'Unit of analysis defined', run: check_unit_of_analysis },
  { id: 'replicates', label: 'Seeds / run count reported', run: check_replicates },
  { id: 'provenance', label: 'Data provenance identified', run: check_provenance },
  { id: 'abstract_body_number', label: 'Abstract numbers match the body', run: check_abstract_body_number },
  { id: 'figure_orphan', label: 'Every exhibit is cited', run: check_figure_orphan },
  { id: 'balance', label: 'Section lengths are balanced', run: check_balance },
  { id: 'abstract_quant', label: 'Abstract states a scoped, quantitative result', run: check_abstract_quant },
  { id: 'overclaim', label: 'Strong claims are backed by evidence', run: check_overclaim },
  { id: 'limitations', label: 'Limitations are specific', run: check_limitations },
  { id: 'reference_missing', label: 'Citations match the reference list', run: check_reference_missing },
];

function runAllChecks(text, config) {
  const cfg = config || CONFIG;
  const ctx = buildContext(text, cfg);
  const results = [];
  for (const check of CHECKS) {
    if (cfg.checks[check.id] === false) continue;
    const result = check.run(ctx);
    results.push({ ...result, label: check.label });
  }
  return { ctx, results };
}

function scoreResults(results) {
  let score = 100;
  let blockers = 0, warns = 0, infos = 0;
  for (const r of results) {
    for (const f of r.flags) {
      if (f.severity === 'blocker') { blockers++; score -= 12; }
      else if (f.severity === 'warn') { warns++; score -= 4; }
      else { infos++; score -= 1; }
    }
  }
  score = Math.max(0, score);
  return { score, blockers, warns, infos };
}

// ---------------------------------------------------------------------------
// Export (Node for tests, plain globals for the browser)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG, CHECKS, runAllChecks, scoreResults, splitSentences, detectSections,
    buildContext, isTheoryPaper,
  };
}
