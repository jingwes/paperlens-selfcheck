const assert = require('assert');
const { runAllChecks, scoreResults } = require('../checks.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  - ${name}`);
    console.log('        ' + e.message);
  }
}

function flagsFor(results, id) {
  const r = results.find((x) => x.id === id);
  return r ? r.flags : [];
}

// ---------------------------------------------------------------------------
// Self-test 1: theory paper -> no overclaim, no sample_size blocker
// ---------------------------------------------------------------------------
test('theory paper produces no overclaim flags and no sample_size blocker', () => {
  const text = `
Abstract
We study the stability of a class of dynamical systems and we prove a general
theorem characterizing convergence.

Introduction
Prior work has studied related systems (Smith et al., 2019).

Methods
We derive the main result using a standard fixed-point argument. We prove
theorem 1 using a contraction mapping. The proof of the corollary follows
from the lemma by a direct derivation.

Results
Theorem 1 gives the convergence rate. Lemma 2 and its proof give a
tighter bound. We proved corollary 3 using the derivation from Section 2.

Discussion
Limitations: our analysis assumes a fixed step size and we did not test
adaptive schedules.
`;
  const { results } = runAllChecks(text);
  const overclaim = flagsFor(results, 'overclaim');
  const sampleSize = flagsFor(results, 'sample_size');
  assert.strictEqual(overclaim.length, 0, `expected 0 overclaim flags, got ${overclaim.length}`);
  assert.strictEqual(sampleSize.length, 1, `expected 1 sample_size flag (downgraded), got ${sampleSize.length}`);
  assert.strictEqual(sampleSize[0].severity, 'warn', 'sample_size flag should be downgraded to warn for theory papers');
  assert.ok(/system sizes/i.test(sampleSize[0].title));
});

// ---------------------------------------------------------------------------
// Self-test 2: abstract 0.904 vs results 0.894 -> abstract_body_number
// ---------------------------------------------------------------------------
test('abstract/body number mismatch raises abstract_body_number', () => {
  const text = `
Abstract
Our model achieves an accuracy of 0.904 on the held-out test set, n = 120
samples, with 95% CI reported in the main text.

Introduction
We study a classification task.

Methods
We evaluate n = 120 samples using standard cross-validation with fixed
seeds across 5 runs.

Results
The model achieves an accuracy of 0.894 (95% CI 0.87-0.91), compared to a
random baseline of 0.50.

Discussion
Limitations: we did not test out-of-distribution generalization.
`;
  const { results } = runAllChecks(text);
  const flags = flagsFor(results, 'abstract_body_number');
  assert.ok(flags.length >= 1, 'expected at least one abstract_body_number flag');
  assert.ok(flags.some((f) => f.highlight === '0.904'));
});

// ---------------------------------------------------------------------------
// Self-test 3: Figure 7 caption never cited -> figure_orphan
// ---------------------------------------------------------------------------
test('uncited Figure 7 caption raises figure_orphan for #7', () => {
  const text = `
Abstract
We present results, n = 50 samples, mean ± s.d. reported throughout.

Introduction
Background material here, compared to prior work.

Methods
We used n = 50 samples across 3 independent replicates.

Results
Figure 1 shows the main trend across conditions.
As shown in Figure 1, the effect is significant.
Figure 7 shows a secondary trend not discussed elsewhere in the text.

Discussion
Limitations: we did not test additional cohorts.
`;
  const { results } = runAllChecks(text);
  const flags = flagsFor(results, 'figure_orphan');
  assert.ok(flags.some((f) => /Figure 7/.test(f.title)), 'expected a Figure 7 orphan flag');
  assert.ok(!flags.some((f) => /Figure 1/.test(f.title)), 'Figure 1 was cited and should not be flagged');
});

// ---------------------------------------------------------------------------
// Self-test 4: percentage with no ± anywhere -> uncertainty_absent
// ---------------------------------------------------------------------------
test('percentage with no uncertainty token anywhere raises uncertainty_absent', () => {
  const text = `
Abstract
Our method achieves 92% accuracy on the benchmark, n = 200 samples.

Introduction
We study a benchmark task, compared to prior baselines.

Methods
We used n = 200 samples with fixed seeds across 5 runs.

Results
The method reaches 92% accuracy on the test set.

Discussion
Limitations: we did not test other domains.
`;
  const { results } = runAllChecks(text);
  const flags = flagsFor(results, 'uncertainty_absent');
  assert.strictEqual(flags.length, 1);
  assert.strictEqual(flags[0].severity, 'blocker');
});

// ---------------------------------------------------------------------------
// Self-test 5: "outperforms prior methods" with no baseline -> baseline blocker
// ---------------------------------------------------------------------------
test('superiority claim with no named baseline raises baseline_missing as blocker', () => {
  const text = `
Abstract
Our method outperforms prior methods on the benchmark, n = 300 samples.

Introduction
We study a benchmark task.

Methods
We used n = 300 samples across 5 independent runs with fixed seeds.

Results
Our approach outperforms prior methods by a wide margin, achieving 88% ±
2% accuracy.

Discussion
Limitations: we did not test additional datasets.
`;
  const { results } = runAllChecks(text);
  const flags = flagsFor(results, 'baseline');
  assert.strictEqual(flags.length, 1);
  assert.strictEqual(flags[0].severity, 'blocker');
  assert.ok(/outperforms/i.test(flags[0].quote));
});

// ---------------------------------------------------------------------------
// Extra: empty-state pass messages surface when nothing is wrong
// ---------------------------------------------------------------------------
test('a clean, well-reported paper produces mostly pass messages and a high score', () => {
  const text = `
Abstract
We report a classification accuracy of 0.90 ± 0.02 (95% CI 0.87-0.93) across
n = 250 participants, compared to a random baseline of 0.50. In our sample,
this suggests the method is promising under these conditions.

Introduction
We study a classification task relevant to prior work (Smith et al., 2021).

Methods
We recruited n = 250 participants. Each biological replicate corresponds to
one participant. The dataset is publicly available at doi.org/10.1000/xyz,
version 2. We used fixed seeds across 5 independent runs for the classifier.

Results
Figure 1 shows the main result (see Figure 1). The model reaches 0.90 ±
0.02 accuracy (95% CI 0.87-0.93), compared to the random baseline of 0.50
± 0.01.

Discussion
This is consistent with prior findings in our sample. Limitations: we did
not test the model on an independent external cohort, which would be the
most direct way to confirm generalization.

References
[1] Smith, J. et al. (2021). A prior study. Journal of Examples.
`;
  const { results } = runAllChecks(text);
  const { score, blockers } = scoreResults(results);
  assert.strictEqual(blockers, 0, `expected 0 blockers, got ${blockers}`);
  assert.ok(score >= 80, `expected a high score, got ${score}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
