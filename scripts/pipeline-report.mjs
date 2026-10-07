// pipeline-report.mjs — run every scenario from examples/ side by side and
// print where the work ends up. Exits non-zero if an invariant breaks.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  createPipeline, submitIdea, runUntilSettled, recover, pipelineReport,
} from '../public/pipeline.mjs';

const EXAMPLES = fileURLToPath(new URL('../examples', import.meta.url));
const scenarioFiles = readdirSync(EXAMPLES).filter((f) => f.endsWith('.json')).sort();

const EXPECTED = {
  'full-stack':      { done: 3, stalled: 0, untrackedShips: 0, releases: 3 },
  'no-orchestrator': { done: 0, stalled: 3, untrackedShips: 0, releases: 0, stallStage: 'context' },
  'no-governor':     { done: 3, stalled: 0, untrackedShips: 3, releases: 0 },
};

const rows = [];
let failures = 0;

for (const file of scenarioFiles) {
  const name = file.replace(/\.json$/, '');
  const scenario = JSON.parse(readFileSync(join(EXAMPLES, file), 'utf8'));
  const pipe = createPipeline(scenario);
  for (const title of scenario.items) submitIdea(pipe, { title });
  runUntilSettled(pipe);
  const report = pipelineReport(pipe);

  // Probe recoverability of the first item.
  let recoverable = '—';
  try {
    const rel = recover(pipe, pipe.items[0].id);
    recoverable = `yes (${rel.id})`;
  } catch {
    recoverable = 'no';
  }

  const stalledAt = Object.entries(report.stalledByStage)
    .map(([s, n]) => `${s}:${n}`).join(' ') || '—';
  rows.push({ name, ...report, stalledAt, recoverable });

  // Assert expectations.
  const want = EXPECTED[name];
  if (!want) { console.log(`!! no expectation for scenario ${name}`); failures++; continue; }
  const mismatches = [];
  for (const key of ['done', 'stalled', 'untrackedShips', 'releases']) {
    if (report[key] !== want[key]) mismatches.push(`${key}: got ${report[key]}, want ${want[key]}`);
  }
  if (want.stallStage && report.stalledByStage[want.stallStage] !== report.stalled) {
    mismatches.push(`stalls should all sit at "${want.stallStage}"`);
  }
  if (mismatches.length) {
    failures++;
    console.log(`!! ${name}: ${mismatches.join('; ')}`);
  }
}

const header = ['scenario'.padEnd(16), 'items', 'done', 'stalled', 'stalled at'.padEnd(12), 'untracked', 'releases', 'recoverable'];
console.log('\n' + header.join(' | '));
console.log('-'.repeat(header.join(' | ').length));
for (const r of rows) {
  console.log([
    r.name.padEnd(16),
    String(r.items),
    String(r.done),
    String(r.stalled),
    r.stalledAt.padEnd(12),
    String(r.untrackedShips),
    String(r.releases),
    r.recoverable,
  ].join(' | '));
}
console.log();

if (failures) {
  console.log(`${failures} scenario assertion(s) failed`);
  process.exit(1);
}
console.log('All scenario invariants hold.');
