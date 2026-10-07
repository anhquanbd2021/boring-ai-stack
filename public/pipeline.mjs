// pipeline.mjs — teaching model of a personal AI-work pipeline:
// a work item travels idea -> context -> build -> review -> ship -> learn,
// and each stage is owned by exactly one layer (one tool, one job).
// Shared by the browser lab, the CLI report, and the test suite.

export const STAGES = ['idea', 'context', 'build', 'review', 'ship', 'learn'];

// Layer ownership map — the "one job per tool" rule made literal.
export const LAYERS = {
  workspace: {
    owns: ['idea'],
    job: 'turn a raw idea into a structured spec',
  },
  orchestrator: {
    owns: ['context', 'learn'],
    job: 'route work, assemble context, hold state, capture lessons',
  },
  builder: {
    owns: ['build'],
    job: 'make the change — explore options, weigh trade-offs, execute',
  },
  governor: {
    owns: ['review', 'ship'],
    job: 'version, review, and record the work so it is recoverable',
  },
};

export const LAYER_NAMES = Object.keys(LAYERS);

// stage -> owning layer (derived; each stage has exactly one owner)
export const STAGE_OWNER = Object.fromEntries(
  LAYER_NAMES.flatMap((layer) => LAYERS[layer].owns.map((s) => [s, layer])),
);

export const NEXT_STAGE = Object.fromEntries(
  STAGES.map((s, i) => [s, STAGES[i + 1] ?? 'done']),
);

// The artifact each stage must hand to the next — handoffs carry state, not vibes.
export const REQUIRED_ARTIFACT = {
  context: 'spec',
  build: 'contextPack',
  review: 'changeSet',
  ship: 'approval',
  learn: 'releaseId',
};

const DEFAULT_ITEMS = [
  { title: 'Retry logic for the webhook consumer', detail: 'backoff + dead-letter after 5 tries' },
  { title: 'Cache the pricing lookup', detail: 'it is called 40x per checkout' },
  { title: 'Weekly report generator', detail: 'turn last weeks metrics into a draft post' },
];

export function createPipeline({ layers = {}, governorBypass = 'stall' } = {}) {
  if (!['stall', 'untracked'].includes(governorBypass)) {
    throw new Error(`governorBypass must be "stall" or "untracked" — got ${governorBypass}`);
  }
  return {
    layers: {
      workspace: layers.workspace ?? true,
      orchestrator: layers.orchestrator ?? true,
      builder: layers.builder ?? true,
      governor: layers.governor ?? true,
    },
    governorBypass,
    items: [],
    releases: [],   // release ledger — the governor's source of truth
    lessons: [],    // retrospective notes — the learn stage's output
    log: [],
    tickCount: 0,
    nextItem: 1,
    nextRelease: 1,
  };
}

function say(pipe, event, detail, itemId = null) {
  pipe.log.push({ tick: pipe.tickCount, event, itemId, detail });
}

export function submitIdea(pipe, { title, detail = '' } = {}) {
  if (!title) throw new Error('an idea needs a title');
  const item = {
    id: `wi-${pipe.nextItem++}`,
    title,
    detail,
    stage: 'idea',
    status: 'active',      // active -> stalled | done
    untracked: false,      // true if it shipped with no release record
    stallReason: null,
    artifacts: {},
    history: [],
  };
  pipe.items.push(item);
  say(pipe, 'submit', `"${title}" enters the pipeline as a raw idea`, item.id);
  return item;
}

// The handoff contract: you may only move an item to the NEXT stage, and the
// artifact that stage requires must already exist on the item.
export function handoff(pipe, item, toStage) {
  const expected = NEXT_STAGE[item.stage];
  if (toStage !== expected) {
    throw new Error(
      `handoff rejected: ${item.stage} -> ${toStage} skips a stage ` +
      `(next is ${expected}). Handoffs carry state, not vibes.`,
    );
  }
  const needed = REQUIRED_ARTIFACT[toStage];
  if (needed && !(needed in item.artifacts)) {
    throw new Error(
      `handoff rejected: ${toStage} requires ${needed}, ` +
      `but ${item.id} is carrying only [${Object.keys(item.artifacts).join(', ') || 'nothing'}]`,
    );
  }
  const artifact = needed ?? 'lesson';
  item.history.push({ from: item.stage, to: toStage, artifact, tick: pipe.tickCount });
  item.stage = toStage;
  return item;
}

// One stage does its one job: produce its artifact, hand the item onward.
function process(pipe, item, stage) {
  switch (stage) {
    case 'idea':
      item.artifacts.spec = {
        title: item.title,
        scope: item.detail || 'unspecified scope',
        acceptance: `done means: ${item.title.toLowerCase()} works and is recorded`,
      };
      say(pipe, 'spec', `workspace produced a spec for "${item.title}"`, item.id);
      handoff(pipe, item, 'context');
      break;
    case 'context':
      item.artifacts.contextPack = {
        files: ['src/**', 'docs/spec.md'],
        decisions: [`${item.artifacts.spec.title}: scope recorded`],
        constraints: ['no new dependencies'],
      };
      say(pipe, 'route', `orchestrator assembled a context pack and routed ${item.id} to build`, item.id);
      handoff(pipe, item, 'build');
      break;
    case 'build':
      item.artifacts.changeSet = {
        diff: `+ ${item.title} implementation`,
        notes: 'chose the boring option; documented trade-offs',
      };
      say(pipe, 'build', `builder returned a change set for "${item.title}"`, item.id);
      handoff(pipe, item, 'review');
      break;
    case 'review':
      item.artifacts.approval = { gate: 'governor', verdict: 'approved', notes: 'diff checked against spec' };
      say(pipe, 'approve', `governor review gate approved ${item.id}`, item.id);
      handoff(pipe, item, 'ship');
      break;
    case 'ship': {
      const release = {
        id: `rel-${pipe.nextRelease++}`,
        version: `v1.0.${pipe.nextRelease - 1}`,
        itemId: item.id,
        snapshot: { ...item.artifacts },
      };
      pipe.releases.push(release);
      item.artifacts.releaseId = release.id;
      say(pipe, 'release', `governor recorded ${release.id} (${release.version}) for ${item.id}`, item.id);
      handoff(pipe, item, 'learn');
      break;
    }
    case 'learn': {
      const lesson = `"${item.title}": shipped via ${item.history.length} handoffs — ` +
        (item.untracked ? 'untracked; nothing to recover' : 'recoverable via ' + item.artifacts.releaseId);
      pipe.lessons.push(lesson);
      item.status = 'done';
      say(pipe, 'learn', `orchestrator logged a retrospective for ${item.id}`, item.id);
      item.history.push({ from: 'learn', to: 'done', artifact: 'lesson', tick: pipe.tickCount });
      item.stage = 'done';
      break;
    }
    default:
      break;
  }
}

function stall(pipe, item, stage, owner) {
  const reason = `no ${owner}: the "${stage}" stage has no owner`;
  // Only record the transition — a stalled item re-stalls every tick quietly.
  if (item.status !== 'stalled' || item.stallReason !== reason) {
    say(pipe, 'stall', `${item.id} stalls at "${stage}" — no ${owner} owns it`, item.id);
  }
  item.status = 'stalled';
  item.stallReason = reason;
}

// Process every item queued at a stage. Disabled layer -> the item stalls
// exactly where the missing job was (and resumes if the layer returns).
function processStage(pipe, stage) {
  const owner = STAGE_OWNER[stage];
  let moved = 0;
  for (const item of pipe.items) {
    if (item.stage !== stage || item.status === 'done') continue;
    if (!pipe.layers[owner]) {
      // Special case: governor off in "untracked" mode ships over the wall —
      // work still moves, but nothing is recorded and nothing is recoverable.
      if (owner === 'governor' && pipe.governorBypass === 'untracked' && stage === 'review') {
        item.untracked = true;
        item.status = 'active';
        item.stallReason = null;
        item.history.push({ from: 'review', to: 'learn', artifact: 'untracked ship', tick: pipe.tickCount });
        item.stage = 'learn';
        say(pipe, 'untracked-ship', `${item.id} ships over the wall — no review, no release record`, item.id);
        moved++;
        continue;
      }
      stall(pipe, item, stage, owner);
      continue;
    }
    item.status = 'active';
    item.stallReason = null;
    process(pipe, item, stage);
    moved++;
  }
  return moved;
}

// One pass over the pipeline. Stages run in REVERSE order so an item that
// arrives at a stage this tick waits for the next one — one stage per tick,
// which is what makes stalls and queues visible instead of instantaneous.
export function tick(pipe) {
  pipe.tickCount++;
  let moved = 0;
  for (const stage of [...STAGES].reverse()) moved += processStage(pipe, stage);
  return moved;
}

export function runUntilSettled(pipe, maxTicks = 50) {
  let ticks = 0;
  while (ticks < maxTicks && tick(pipe) > 0) ticks++;
  return ticks;
}

// Recovery is only possible through the governor's release ledger.
export function recover(pipe, itemId) {
  const release = pipe.releases.find((r) => r.itemId === itemId);
  if (!release) {
    const item = pipe.items.find((i) => i.id === itemId);
    throw new Error(
      `unrecoverable: ${itemId} has no release record` +
      (item?.untracked ? ' — it shipped untracked' : ''),
    );
  }
  say(pipe, 'recover', `recovered ${itemId} from ${release.id} (${release.version})`, itemId);
  return release;
}

export function pipelineReport(pipe) {
  const stalledByStage = {};
  for (const item of pipe.items) {
    if (item.status === 'stalled') {
      stalledByStage[item.stage] = (stalledByStage[item.stage] ?? 0) + 1;
    }
  }
  return {
    items: pipe.items.length,
    done: pipe.items.filter((i) => i.status === 'done').length,
    stalled: pipe.items.filter((i) => i.status === 'stalled').length,
    untrackedShips: pipe.items.filter((i) => i.untracked).length,
    stalledByStage,
    releases: pipe.releases.length,
    lessons: pipe.lessons.length,
    ticks: pipe.tickCount,
  };
}

export { DEFAULT_ITEMS };
