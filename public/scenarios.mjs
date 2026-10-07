// scenarios.mjs — named pipeline configurations.
// Mirrored by the JSON fixtures in examples/ (sync asserted by tests).

export const SCENARIOS = {
  'full-stack': {
    label: 'Full stack — every stage has an owner',
    layers: { workspace: true, orchestrator: true, builder: true, governor: true },
    governorBypass: 'stall',
    items: [
      'Retry logic for the webhook consumer',
      'Cache the pricing lookup',
      'Weekly report generator',
    ],
  },
  'no-orchestrator': {
    label: 'No orchestrator — work stalls unrouted after intake',
    layers: { workspace: true, orchestrator: false, builder: true, governor: true },
    governorBypass: 'stall',
    items: [
      'Retry logic for the webhook consumer',
      'Cache the pricing lookup',
      'Weekly report generator',
    ],
  },
  'no-governor': {
    label: 'No governor — work ships untracked and cannot be recovered',
    layers: { workspace: true, orchestrator: true, builder: true, governor: false },
    governorBypass: 'untracked',
    items: [
      'Retry logic for the webhook consumer',
      'Cache the pricing lookup',
      'Weekly report generator',
    ],
  },
};

export function loadScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`unknown scenario: ${name}`);
  return scenario;
}
