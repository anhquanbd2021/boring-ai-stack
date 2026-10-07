import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES, LAYERS, STAGE_OWNER, NEXT_STAGE, REQUIRED_ARTIFACT,
  createPipeline, submitIdea, handoff, tick, runUntilSettled,
  recover, pipelineReport,
} from '../public/pipeline.mjs';

const ALL_ON = { workspace: true, orchestrator: true, builder: true, governor: true };

function fullPipe(items = ['Fix the importer']) {
  const pipe = createPipeline({ layers: ALL_ON });
  for (const title of items) submitIdea(pipe, { title });
  return pipe;
}

test('every stage has exactly one owning layer, and the owners are the four layers', () => {
  assert.deepEqual(STAGES, ['idea', 'context', 'build', 'review', 'ship', 'learn']);
  for (const stage of STAGES) {
    assert.ok(STAGE_OWNER[stage], `stage ${stage} has no owner`);
  }
  assert.equal(new Set(Object.values(STAGE_OWNER)).size, 4);
  assert.equal(STAGE_OWNER.idea, 'workspace');
  assert.equal(STAGE_OWNER.context, 'orchestrator');
  assert.equal(STAGE_OWNER.build, 'builder');
  assert.equal(STAGE_OWNER.review, 'governor');
  assert.equal(STAGE_OWNER.ship, 'governor');
  assert.equal(STAGE_OWNER.learn, 'orchestrator');
  // one job per tool: no stage owned twice
  const owned = Object.values(LAYERS).flatMap((l) => l.owns);
  assert.equal(new Set(owned).size, owned.length);
});

test('full stack carries one item through all six stages to done', () => {
  const pipe = fullPipe();
  const ticks = runUntilSettled(pipe);
  const item = pipe.items[0];
  assert.equal(item.status, 'done');
  assert.equal(item.stage, 'done');
  // six handoffs: idea->context->build->review->ship->learn, then learn->done
  assert.equal(item.history.length, 6);
  assert.deepEqual(
    item.history.map((h) => `${h.from}->${h.to}`),
    ['idea->context', 'context->build', 'build->review', 'review->ship', 'ship->learn', 'learn->done'],
  );
  // the item carried every artifact — state, not vibes
  for (const a of ['spec', 'contextPack', 'changeSet', 'approval', 'releaseId']) {
    assert.ok(item.artifacts[a], `missing artifact ${a}`);
  }
  assert.equal(pipe.releases.length, 1);
  assert.equal(pipe.lessons.length, 1);
  assert.ok(ticks >= 6);
});

test('handoff rejects skipping a stage — handoffs carry state, not vibes', () => {
  const pipe = fullPipe();
  const item = pipe.items[0];
  assert.throws(() => handoff(pipe, item, 'build'), /skips a stage/);
  assert.throws(() => handoff(pipe, item, 'done'), /skips a stage/);
});

test('handoff rejects a missing required artifact', () => {
  const pipe = fullPipe();
  const item = pipe.items[0];
  // force the stage forward without artifacts to isolate the contract check
  item.stage = 'review';
  assert.throws(() => handoff(pipe, item, 'ship'), /requires approval/);
});

test('no orchestrator: items clear intake then stall unrouted at context', () => {
  const pipe = createPipeline({ layers: { ...ALL_ON, orchestrator: false } });
  for (const t of ['a', 'b', 'c']) submitIdea(pipe, { title: t });
  runUntilSettled(pipe);
  const report = pipelineReport(pipe);
  assert.equal(report.done, 0);
  assert.equal(report.stalled, 3);
  assert.equal(report.stalledByStage.context, 3);
  assert.equal(pipe.items[0].stallReason, 'no orchestrator: the "context" stage has no owner');
  // spec was produced (workspace worked) but contextPack never arrived
  assert.ok(pipe.items[0].artifacts.spec);
  assert.equal(pipe.items[0].artifacts.contextPack, undefined);
});

test('restoring the layer unstalls the queue', () => {
  const pipe = createPipeline({ layers: { ...ALL_ON, orchestrator: false } });
  submitIdea(pipe, { title: 'stuck item' });
  runUntilSettled(pipe);
  assert.equal(pipe.items[0].status, 'stalled');
  pipe.layers.orchestrator = true;
  runUntilSettled(pipe);
  assert.equal(pipe.items[0].status, 'done');
});

test('no workspace: raw ideas stall at intake; no builder: work stalls at build', () => {
  const p1 = createPipeline({ layers: { ...ALL_ON, workspace: false } });
  submitIdea(p1, { title: 'x' });
  runUntilSettled(p1);
  assert.equal(p1.items[0].stallReason, 'no workspace: the "idea" stage has no owner');

  const p2 = createPipeline({ layers: { ...ALL_ON, builder: false } });
  submitIdea(p2, { title: 'x' });
  runUntilSettled(p2);
  assert.equal(p2.items[0].stage, 'build');
  assert.equal(p2.items[0].status, 'stalled');
});

test('no governor in stall mode: work waits at review', () => {
  const pipe = createPipeline({ layers: { ...ALL_ON, governor: false }, governorBypass: 'stall' });
  submitIdea(pipe, { title: 'x' });
  runUntilSettled(pipe);
  const item = pipe.items[0];
  assert.equal(item.stage, 'review');
  assert.equal(item.status, 'stalled');
  assert.equal(pipe.releases.length, 0);
});

test('no governor in untracked mode: work ships but cannot be recovered', () => {
  const pipe = createPipeline({ layers: { ...ALL_ON, governor: false }, governorBypass: 'untracked' });
  submitIdea(pipe, { title: 'ship it anyway' });
  runUntilSettled(pipe);
  const item = pipe.items[0];
  assert.equal(item.status, 'done');
  assert.equal(item.untracked, true);
  assert.equal(pipe.releases.length, 0);
  assert.throws(() => recover(pipe, item.id), /unrecoverable/);
});

test('governor-tracked work is recoverable through the release ledger', () => {
  const pipe = fullPipe();
  runUntilSettled(pipe);
  const release = recover(pipe, 'wi-1');
  assert.equal(release.itemId, 'wi-1');
  assert.match(release.version, /^v1\.0\./);
  assert.ok(release.snapshot.spec);
  assert.ok(release.snapshot.approval);
});

test('NEXT_STAGE and REQUIRED_ARTIFACT agree on the chain', () => {
  assert.equal(NEXT_STAGE.learn, 'done');
  for (const [stage, artifact] of Object.entries(REQUIRED_ARTIFACT)) {
    assert.ok(STAGES.includes(stage));
    assert.equal(typeof artifact, 'string');
  }
});
