// Fixed fictional examples only. This module has no network or persistence path.
const scenarios = Object.freeze({
  referral: Object.freeze({
    source: 'Referral R-104 is ready for administrative intake. No appointment time has been confirmed.',
    supported: 'Referral R-104 is ready for intake; an appointment has not been confirmed.',
    missing: 'Referral R-104 is ready for intake and an appointment is confirmed for Tuesday.',
    gap: 'The draft adds an appointment time that the source does not support.',
    queue: 'example intake queue',
  }),
  documentation: Object.freeze({
    source: 'Packet D-208 contains a draft note and two supporting references. The reviewer signature is pending.',
    supported: 'Packet D-208 includes two references; its reviewer signature remains pending.',
    missing: 'Packet D-208 includes two references and a completed reviewer signature.',
    gap: 'The draft claims a completed signature while the source says it is pending.',
    queue: 'example documentation review queue',
  }),
});

export function buildExample(scenario, condition, inspected = false) {
  if (!Object.hasOwn(scenarios, scenario) || !['supported', 'missing', 'unconfirmed'].includes(condition)) {
    return null;
  }
  const sample = scenarios[scenario];
  const blocked = condition === 'missing';
  const uncertain = condition === 'unconfirmed';
  const recovered = uncertain && inspected === true;
  return {
    source: sample.source,
    draft: blocked ? sample.missing : sample.supported,
    check: blocked ? 'Unsupported claim found' : 'Source support matches',
    checkDetail: blocked ? sample.gap : 'The draft preserves what the source says and what remains unknown.',
    review: blocked ? 'Approval is blocked' : 'Independent approval illustrated',
    reviewDetail: blocked ? 'Correct the draft and check it again before requesting approval.'
      : `A separate reviewer approves this draft for the ${sample.queue}.`,
    use: blocked ? 'No handoff permitted' : uncertain ? 'The response is unconfirmed' : 'One specified handoff',
    useDetail: blocked ? 'Missing support prevents this example from proceeding.'
      : uncertain ? 'A lost response does not establish whether the receiving queue accepted the handoff.'
        : 'The approved draft and destination are checked again before the example handoff.',
    state: blocked ? 'blocked' : uncertain && !recovered ? 'uncertain' : 'recorded',
    result: blocked ? 'Blocked until the evidence supports the draft'
      : recovered ? 'A stored receipt confirms the original example handoff'
        : uncertain ? 'The outcome is still unknown' : 'A matching receipt records the handoff',
    next: blocked ? 'A new review must assess the corrected draft. Nothing is sent in this example.'
      : recovered ? `The fixed receipt matches the original draft and ${sample.queue}. No second handoff is sent.`
        : uncertain ? 'Inspect the durable record for the original request. Do not assume failure or resend the action.'
          : 'The example records one handoff. Approval and a recorded outcome are separate facts.',
    recoveryNote: recovered ? 'This example supplies a matching receipt. Missing or conflicting records would leave the outcome unresolved.'
      : uncertain ? 'The button reveals a fixed fictional receipt; it does not contact a system or send another handoff.'
        : 'Choose the lost-response example to explore recovery.',
    canInspect: uncertain && !recovered,
  };
}

export function setupWalkthrough(doc) {
  const ids = ['controls', 'actions', 'scenario', 'condition', 'source', 'draft', 'check', 'check-detail',
    'review', 'review-detail', 'use', 'use-detail', 'outcome', 'result', 'next', 'inspect', 'reset', 'recovery-note'];
  const el = Object.fromEntries(ids.map(id => [id, doc.getElementById(`walkthrough-${id}`)]));
  if (Object.values(el).some(value => !value)) return;
  let inspected = false;
  const render = () => {
    const example = buildExample(el.scenario.value, el.condition.value, inspected);
    if (!example) {
      el.inspect.disabled = true;
      el.outcome.dataset.state = 'uncertain';
      el.result.textContent = 'Example unavailable';
      el.next.textContent = 'Reset the example to return to a known fictional workflow.';
      // Clear the previous trace so it cannot be mistaken for this unknown selection.
      for (const id of ['source', 'draft', 'check', 'check-detail', 'review', 'review-detail', 'use', 'use-detail', 'recovery-note']) {
        el[id].textContent = 'Unavailable';
      }
      return;
    }
    for (const [id, key] of Object.entries({source: 'source', draft: 'draft', check: 'check',
      'check-detail': 'checkDetail', review: 'review', 'review-detail': 'reviewDetail', use: 'use',
      'use-detail': 'useDetail', result: 'result', next: 'next', 'recovery-note': 'recoveryNote'})) {
      el[id].textContent = example[key];
    }
    el.outcome.dataset.state = example.state;
    el.inspect.disabled = !example.canInspect;
  };
  for (const control of [el.scenario, el.condition]) {
    control.addEventListener('change', () => { inspected = false; render(); });
  }
  el.inspect.addEventListener('click', () => {
    if (!buildExample(el.scenario.value, el.condition.value, inspected)?.canInspect) return;
    inspected = true;
    render();
  });
  el.reset.addEventListener('click', () => {
    el.scenario.value = 'referral';
    el.condition.value = 'supported';
    inspected = false;
    render();
  });
  el.controls.hidden = false;
  el.actions.hidden = false;
  render();
}

if (typeof document !== 'undefined') setupWalkthrough(document);
