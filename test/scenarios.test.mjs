import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SCENARIOS } from '../public/scenarios.mjs';
import {
  createPipeline, submitIdea, runUntilSettled, recover, pipelineReport,
} from '../public/pipeline.mjs';

const EXAMPLES = fileURLToPath(new URL('../examples', import.meta.url));

test('examples/*.json mirror SCENARIOS exactly', () => {
  const files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(files.map((f) => f.replace(/\.json$/, '')).sort(), Object.keys(SCENARIOS).sort());
  for (const file of files) {
    const name = file.replace(/\.json$/, '');
    const fixture = JSON.parse(readFileSync(join(EXAMPLES, file), 'utf8'));
    assert.deepEqual(fixture, SCENARIOS[name], `examples/${file} drifted from scenarios.mjs`);
  }
});

test('full-stack scenario ships every item with a release and a lesson', () => {
  const s = SCENARIOS['full-stack'];
  const pipe = createPipeline(s);
  for (const t of s.items) submitIdea(pipe, { title: t });
  runUntilSettled(pipe);
  const r = pipelineReport(pipe);
  assert.equal(r.done, 3);
  assert.equal(r.stalled, 0);
  assert.equal(r.releases, 3);
  assert.equal(r.lessons, 3);
  assert.ok(recover(pipe, 'wi-1'));
});

test('no-orchestrator scenario stalls every item at context', () => {
  const s = SCENARIOS['no-orchestrator'];
  const pipe = createPipeline(s);
  for (const t of s.items) submitIdea(pipe, { title: t });
  runUntilSettled(pipe);
  const r = pipelineReport(pipe);
  assert.equal(r.done, 0);
  assert.equal(r.stalled, 3);
  assert.equal(r.stalledByStage.context, 3);
});

test('no-governor scenario ships untracked and nothing recovers', () => {
  const s = SCENARIOS['no-governor'];
  const pipe = createPipeline(s);
  for (const t of s.items) submitIdea(pipe, { title: t });
  runUntilSettled(pipe);
  const r = pipelineReport(pipe);
  assert.equal(r.done, 3);
  assert.equal(r.untrackedShips, 3);
  assert.equal(r.releases, 0);
  for (const item of pipe.items) {
    assert.throws(() => recover(pipe, item.id), /unrecoverable/);
  }
});
