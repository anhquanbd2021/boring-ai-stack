# Handoff Lab — companion demo

Interactive lab for the article *The Boring AI Stack: One Job per Tool*.
Work items travel a six-stage pipeline — `idea → context → build → review →
ship → learn` — where each stage has exactly one owning layer: workspace,
orchestrator, builder, governor. Toggle a layer off and the stall lands
precisely where its job was.

Zero dependencies — Node 20+ only. The pipeline engine is a plain ES module
shared by the browser UI, the CLI report, and the test suite.

## What it proves

| Layer removed | Where items stall | What you lose |
|---|---|---|
| none (full stack) | — | every item ships with a release record and a lesson |
| workspace | `idea` | ideas never become specs — nothing is buildable |
| orchestrator | `context` | structured work sits unrouted; *you* become the router |
| builder | `build` | specs and context packs accumulate; nothing executes |
| governor (stall) | `review` | reviewed work never ships |
| governor (untracked) | — | work ships with no release record — `recover()` fails |

Every handoff is a contract: `context` requires a `spec`, `build` requires a
`contextPack`, `review` requires a `changeSet`, `ship` requires an
`approval`, `learn` requires a `releaseId`. Skip a stage and the handoff is
rejected — state moves between layers, vibes don't.

## Run it

```text
npm start        # serve the lab on :3000
npm test         # engine invariants + scenarios + server
npm run report   # side-by-side scenario table from examples/
npm run check    # both
```

## Layout

- `public/pipeline.mjs` — the engine: stage ownership, handoff contract,
  stalls, release ledger, `recover()`.
- `public/scenarios.mjs` — named configurations mirrored from
  `examples/*.json` (sync asserted by tests).
- `public/index.html` + `app.js` + `styles.css` + `guide.html` — the board.
- `scripts/pipeline-report.mjs` — CLI that runs every scenario and asserts
  shipped / stalled / untracked / recoverable counts.
- `test/` — `node --test "test/*.test.mjs"`.

## Honest limits

- This simulates the discipline, not the tools — no real agent, tracker, or
  git host is involved.
- Stages process instantly; real pipelines have latency, retries, and
  partial failure.
- `recover()` models rollback via a release ledger; real recovery also
  needs backups, deploy history, and a revert path.
- One item per stage per tick — contention, priorities, and parallel work
  are out of scope.

This is an educational demo, not production infrastructure.
