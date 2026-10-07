// app.js — wires the lab UI to the pipeline engine.
import {
  createPipeline, submitIdea, tick, runUntilSettled, recover,
  pipelineReport, STAGES, STAGE_OWNER, DEFAULT_ITEMS,
} from './pipeline.mjs';
import { SCENARIOS } from './scenarios.mjs';

const $ = (id) => document.getElementById(id);
let pipe = null;
let ideaIdx = 0;
let shownLog = 0;

function log(msg) {
  const li = document.createElement('li');
  li.innerHTML = msg;
  $('log').prepend(li);
}

function drainEngineLog() {
  for (; shownLog < pipe.log.length; shownLog++) {
    const e = pipe.log[shownLog];
    const li = document.createElement('li');
    li.innerHTML = `<code>t${e.tick}</code> <strong>${e.event}</strong> — ${e.detail}`;
    if (e.event === 'stall' || e.event === 'untracked-ship') li.className = 'log-warn';
    $('log').prepend(li);
  }
}

// ---------- scenario select ----------
const scenarioSel = $('scenario');
for (const [key, s] of Object.entries(SCENARIOS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = s.label;
  scenarioSel.append(opt);
}
scenarioSel.value = 'full-stack';

function currentLayers() {
  return {
    workspace: $('layer-workspace').checked,
    orchestrator: $('layer-orchestrator').checked,
    builder: $('layer-builder').checked,
    governor: $('layer-governor').checked,
  };
}

function reset() {
  const s = SCENARIOS[scenarioSel.value];
  for (const layer of Object.keys(s.layers)) $(`layer-${layer}`).checked = s.layers[layer];
  $('governor-bypass').value = s.governorBypass;
  pipe = createPipeline({ layers: s.layers, governorBypass: s.governorBypass });
  $('log').innerHTML = '';
  shownLog = 0;
  for (const title of s.items) submitIdea(pipe, { title });
  log(`<code>scenario: ${scenarioSel.value}</code> — ${s.items.length} work items submitted`);
  render();
}
scenarioSel.addEventListener('change', reset);

for (const layer of ['workspace', 'orchestrator', 'builder', 'governor']) {
  $(`layer-${layer}`).addEventListener('change', () => {
    pipe.layers = currentLayers();
    log(`<code>layer ${$(`layer-${layer}`).checked ? 'restored' : 'removed'}: ${layer}</code>`);
    render();
  });
}
$('governor-bypass').addEventListener('change', () => {
  pipe.governorBypass = $('governor-bypass').value;
  log(`<code>governor bypass: ${pipe.governorBypass}</code>`);
});

$('submit').addEventListener('click', () => {
  const seed = DEFAULT_ITEMS[ideaIdx++ % DEFAULT_ITEMS.length];
  submitIdea(pipe, seed);
  render();
});

$('tick').addEventListener('click', () => { tick(pipe); render(); });
$('run').addEventListener('click', () => { runUntilSettled(pipe); render(); });
$('reset').addEventListener('click', reset);

$('recover').addEventListener('click', () => {
  const target = pipe.items.find((i) => i.status === 'done') ?? pipe.items[0];
  if (!target) { log('<strong>recover:</strong> no items yet'); return; }
  try {
    const rel = recover(pipe, target.id);
    log(`<code>recover(${target.id})</code> → release <code>${rel.id}</code> (${rel.version}) — the work is durable`);
  } catch (err) {
    log(`<strong>recover(${target.id}) failed:</strong> ${err.message}`);
  }
});

// ---------- rendering ----------
const OWNER_COLOR = { workspace: 'teal', orchestrator: 'amber', builder: 'green', governor: 'navy' };

function renderBoard() {
  const board = $('board');
  board.innerHTML = '';
  for (const stage of STAGES) {
    const owner = STAGE_OWNER[stage];
    const lane = document.createElement('div');
    lane.className = 'lane' + (pipe.layers[owner] ? '' : ' lane-dead');
    const head = document.createElement('div');
    head.className = 'lane-head';
    head.innerHTML = `<span class="stage-name">${stage}</span><span class="owner owner-${OWNER_COLOR[owner]}">${owner}${pipe.layers[owner] ? '' : ' — off'}</span>`;
    lane.append(head);
    const queued = pipe.items.filter((i) => i.stage === stage);
    for (const item of queued) {
      lane.append(card(item));
    }
    if (!queued.length) {
      const empty = document.createElement('p');
      empty.className = 'lane-empty';
      empty.textContent = '—';
      lane.append(empty);
    }
    board.append(lane);
  }
  // done column
  const doneLane = document.createElement('div');
  doneLane.className = 'lane lane-done';
  const dh = document.createElement('div');
  dh.className = 'lane-head';
  dh.innerHTML = '<span class="stage-name">done</span><span class="owner owner-green">learned</span>';
  doneLane.append(dh);
  for (const item of pipe.items.filter((i) => i.stage === 'done')) doneLane.append(card(item));
  if (!pipe.items.some((i) => i.stage === 'done')) {
    const p = document.createElement('p');
    p.className = 'lane-empty';
    p.textContent = '—';
    doneLane.append(p);
  }
  board.append(doneLane);
}

function card(item) {
  const el = document.createElement('article');
  el.className = 'card' + (item.status === 'stalled' ? ' card-stalled' : '') + (item.untracked ? ' card-untracked' : '');
  const arts = Object.keys(item.artifacts);
  el.innerHTML =
    `<p class="card-title">${item.id} · ${item.title}</p>` +
    `<p class="card-arts">${arts.length ? arts.map((a) => `<code>${a}</code>`).join(' ') : '<span class="muted">no artifacts yet</span>'}</p>` +
    (item.stallReason ? `<p class="card-stall">${item.stallReason}</p>` : '') +
    (item.untracked ? '<p class="card-stall">untracked ship — no release record</p>' : '');
  return el;
}

function renderStats() {
  const r = pipelineReport(pipe);
  $('tick-badge').textContent = `tick ${r.ticks}`;
  $('stats').innerHTML = [
    ['items', r.items], ['done', r.done], ['stalled', r.stalled],
    ['untracked ships', r.untrackedShips], ['releases', r.releases], ['lessons', r.lessons],
  ].map(([k, v]) => `<div class="stat"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function render() {
  renderBoard();
  renderStats();
  drainEngineLog();
}

reset();
