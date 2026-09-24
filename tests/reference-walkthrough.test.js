import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildExample, setupWalkthrough} from '../assets/reference-walkthrough.js';

function workspace() {
  const ids = ['controls', 'actions', 'scenario', 'condition', 'source', 'draft', 'check', 'check-detail',
    'review', 'review-detail', 'use', 'use-detail', 'outcome', 'result', 'next', 'inspect', 'reset', 'recovery-note'];
  const el = Object.fromEntries(ids.map(id => [id, {textContent: '', value: '', hidden: true,
    disabled: false, dataset: {}, listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; },
    fire(event) { this.listeners[event]?.(); }}]));
  el.scenario.value = 'referral';
  el.condition.value = 'supported';
  setupWalkthrough({getElementById: id => el[id.replace('walkthrough-', '')]});
  return el;
}

for (const scenario of ['referral', 'documentation']) {
  test(`${scenario}: unsupported claims block review and use, even after an inspection request`, () => {
    const result = buildExample(scenario, 'missing', true);
    assert.equal(result.state, 'blocked');
    assert.equal(result.canInspect, false);
    assert.equal(result.review, 'Approval is blocked');
    assert.equal(result.use, 'No handoff permitted');
    assert.notEqual(result.draft, buildExample(scenario, 'supported').draft);
  });
  test(`${scenario}: a lost response stays unknown until the fixed receipt is inspected`, () => {
    const unknown = buildExample(scenario, 'unconfirmed');
    assert.equal(unknown.state, 'uncertain');
    assert.match(unknown.next, /Do not assume failure or resend/);
    const recovered = buildExample(scenario, 'unconfirmed', true);
    assert.equal(recovered.state, 'recorded');
    assert.match(recovered.next, /original draft/);
    assert.match(recovered.next, /No second handoff/);
    assert.match(recovered.recoveryNote, /conflicting records would leave the outcome unresolved/);
    assert.equal(buildExample(scenario, 'unconfirmed', 'true').state, 'uncertain');
  });
}

test('switching workflows or conditions discards the prior recovery observation', () => {
  const el = workspace();
  assert.equal(el.controls.hidden, false);
  el.condition.value = 'unconfirmed'; el.condition.fire('change');
  assert.equal(el.outcome.dataset.state, 'uncertain');
  el.inspect.fire('click');
  assert.equal(el.outcome.dataset.state, 'recorded');
  el.scenario.value = 'documentation'; el.scenario.fire('change');
  assert.equal(el.outcome.dataset.state, 'uncertain');
  assert.match(el.source.textContent, /Packet D-208/);
  assert.equal(el.inspect.disabled, false);
  el.condition.value = 'missing'; el.condition.fire('change');
  el.inspect.fire('click');
  assert.equal(el.outcome.dataset.state, 'blocked');
  el.reset.fire('click');
  assert.equal(el.scenario.value, 'referral');
  assert.equal(el.condition.value, 'supported');
  assert.equal(el.inspect.disabled, true);
});

test('unknown selections clear the prior trace and cannot echo arbitrary markup', () => {
  const el = workspace();
  el.scenario.value = '<img src=x onerror=alert(1)>'; el.scenario.fire('change');
  assert.equal(el.result.textContent, 'Example unavailable');
  assert.equal(el.source.textContent, 'Unavailable');
  assert.equal(el.review.textContent, 'Unavailable');
  assert.equal(el.outcome.dataset.state, 'uncertain');
  assert.equal(el.inspect.disabled, true);
  assert.equal(buildExample('__proto__', 'supported'), null);
  assert.equal(buildExample('referral', 'invalid'), null);
});

test('the walkthrough is optional and has no transport, storage, analytics, or customer claims', () => {
  assert.doesNotThrow(() => setupWalkthrough({getElementById: () => null}));
  const js = readFileSync(new URL('../assets/reference-walkthrough.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage)\b|document\.cookie|innerHTML|analytics/i);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const section = html.slice(html.indexOf('<section class="walkthrough"'), html.indexOf('<section class="editorial-section dark" id="industries"'));
  assert.match(section, /No model runs, customer data is used, or action is sent/);
  assert.match(section, /<noscript>/);
  assert.match(section, /aria-live="polite" aria-atomic="true"/);
  assert.match(section, /label for="walkthrough-scenario"/);
  assert.match(section, /label for="walkthrough-condition"/);
  assert.match(section, /button type="button"/);
  assert.doesNotMatch(section + js, /\bGMVA\b|Kaiser|Permanente|data-analytics-event|<form\b/i);
});
