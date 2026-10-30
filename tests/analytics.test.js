import assert from "node:assert/strict";
import test from "node:test";
import { createTracker, measurementAllowed, normalizeEventPayload, setupConversionAnalytics, SESSION_KEY, EXCLUSION_KEY } from "../assets/analytics.js";
import { SESSION_IDLE_MS, SESSION_MAX_MS, campaignCategories } from "../assets/measurement-schema.js";
import { MAX_BODY_BYTES, normalizePayload, onRequestGet, onRequestPost } from "../functions/api/events.js";
import { readSession } from "../functions/_lib/measurement.js";
import { testDatabase } from "./d1-helper.js";

const ID = "12345678-1234-4123-8123-123456789abc";
const NOW = 1793400000000;
const base = { event: "intake_started", page: "/get-started", placement: "intake_form", intent: "enterprise-pilot", schema_version: "2", session_id: ID, source: "aws", medium: "email", campaign: "aws-cosell" };
const storage = () => { const values = new Map(); return { getItem: (k) => values.get(k) || null, setItem: (k,v) => values.set(k,v), removeItem: (k) => values.delete(k) }; };
function browser() {
  const beacons = [];
  const win = { Blob, crypto, fetch: async () => new Response(null, { status: 204 }),
    location: new URL("https://www.digitranshq.com/?utm_source=aws&utm_medium=email&utm_campaign=aws-cosell"),
    sessionStorage: storage(), localStorage: storage(), history: { replaceState: () => {} },
    navigator: { sendBeacon: (url,body) => { beacons.push({ url,body }); return true; } },
    setInterval: () => 1, clearInterval: () => {},
  };
  return { win, beacons };
}
function request(payload = base, options = {}) {
  const req = new Request("https://www.digitranshq.com/api/events", { method: "POST", headers: { Origin: "https://www.digitranshq.com", "Content-Type": "application/json", ...options.headers }, body: typeof payload === "string" ? payload : JSON.stringify(payload) });
  if (options.cf) Object.defineProperty(req, "cf", { value: options.cf });
  return req;
}
function environment() {
  const points = [];
  return { points, env: { MEASUREMENT_DB: testDatabase(), CONVERSION_EVENTS: { writeDataPoint: (p) => points.push(p) } } };
}

test("only fixed paths, placements, intent and campaign categories leave the browser", () => {
  const payload = normalizeEventPayload("briefing_cta_clicked", { page: "/get-started?email=private@example.com", placement: "Hero", intent: "enterprise-pilot", email: "private@example.com" });
  assert.deepEqual(payload, { event: "briefing_cta_clicked", page: "/get-started", placement: "hero", intent: "enterprise-pilot", schema_version: "2" });
  assert.equal(normalizeEventPayload("lead_submitted"), null);
  assert.equal(normalizeEventPayload("intake_started", { page: "/private-person", placement: "private-person", intent: "private-person" }).page, "/");
  assert.deepEqual(campaignCategories({ utm_source: "private@example.com", utm_campaign: "John", utm_medium: "recipient-123" }), { source: "other", medium: "other", campaign: "other" });
  assert.equal(campaignCategories({}, "https://www.linkedin.com/feed/").source, "linkedin");
  assert.equal(campaignCategories({}, "https://linkedin.com.attacker.example/").source, "other");
});

test("GPC, DNT, webdriver and internal opt-out suppress all browser events", () => {
  for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: "1" }, { webdriver: true }]) {
    const { win, beacons } = browser(); Object.assign(win.navigator, nav);
    assert.equal(measurementAllowed(win.navigator), false);
    assert.equal(createTracker({ window: win })("session_started"), false);
    assert.equal(beacons.length, 0); assert.equal(win.sessionStorage.getItem(SESSION_KEY), null);
  }
  const { win, beacons } = browser(); win.location.hash = "#analytics=off";
  const track = createTracker({ window: win });
  assert.equal(track.scope(), "internal"); assert.equal(track("session_started"), false);
  assert.equal(beacons.length, 0); assert.equal(win.localStorage.getItem(EXCLUSION_KEY), "1");
  win.location.hash = "#analytics=on";
  const restored = createTracker({ window: win });
  assert.equal(restored.scope(), "external");
  win.location.hash = "#analytics=off";
  assert.equal(restored("session_started"), false);
  assert.equal(restored.scope(), "internal");
});

test("session survives reload, keeps first attribution, expires after inactivity and has a 24h maximum", async () => {
  const { win, beacons } = browser(); let time = NOW;
  let track = createTracker({ window: win, now: () => time });
  track("session_started", { page: "/" }); const first = track.session().id;
  win.location = new URL("https://www.digitranshq.com/pricing/?utm_source=linkedin");
  track = createTracker({ window: win, now: () => time });
  assert.equal(track.session().id, first); assert.equal(track.session().source, "aws");
  time += SESSION_IDLE_MS;
  assert.notEqual(track.session().id, first);
  const second = track.session().id;
  for (let i = 0; i < 49; i++) { time += SESSION_IDLE_MS - 1; track.session(); }
  assert.notEqual(track.session().id, second);
  const payload = JSON.parse(await beacons[0].body.text());
  assert.equal(payload.session_id, first); assert.equal(payload.source, "aws");
  assert.equal(payload.schema_version, "2");
});

test("unavailable session storage drops measurement without blocking the page", () => {
  const { win, beacons } = browser(); win.sessionStorage.getItem = () => { throw new Error("blocked"); };
  assert.equal(createTracker({ window: win })("session_started"), false);
  assert.equal(beacons.length, 0);
});

test("concurrent reloads, clicks and retries count once per session and stage", async () => {
  const { env, points } = environment();
  const responses = await Promise.all(Array.from({ length: 8 }, () => onRequestPost({ request: request(), env }, { now: () => NOW })));
  assert.ok(responses.every((r) => r.status === 204));
  assert.deepEqual(points.map((p) => p.blobs[0]), ["session_started", "intake_started"]);
  assert.equal(points[0].blobs[5], "aws");
  await onRequestPost({ request: request({ ...base, event: "engaged_session", source: "linkedin" }), env }, { now: () => NOW + 10 });
  assert.equal(points[2].blobs[0], "engaged_session"); assert.equal(points[2].blobs[5], "aws");
  assert.equal(JSON.stringify(points).includes(ID), false);
  assert.deepEqual(Object.keys(await readSession(env.MEASUREMENT_DB, ID, NOW + 20)).sort(), ["campaign", "medium", "source"]);
});

test("expired IDs cannot extend a session and old dedup records are cleaned with cascading deletes", async () => {
  const { env, points } = environment();
  await onRequestPost({ request: request(), env }, { now: () => NOW });
  const expired = await onRequestPost({ request: request(), env }, { now: () => NOW + SESSION_IDLE_MS });
  assert.equal(expired.status, 410); assert.equal(points.length, 2);
  assert.equal(await readSession(env.MEASUREMENT_DB, ID, NOW + SESSION_IDLE_MS), null);
  const newID = crypto.randomUUID();
  await onRequestPost({ request: request({ ...base, session_id: newID }), env }, { now: () => NOW + SESSION_MAX_MS + 1 });
  assert.equal(env.MEASUREMENT_DB.sqlite.prepare("SELECT count(*) AS n FROM measurement_sessions").get().n, 1);
  assert.equal(env.MEASUREMENT_DB.sqlite.prepare("SELECT count(*) AS n FROM measurement_events").get().n, 2);
});

test("server also suppresses privacy signals, EU measurement and available bot signals", async () => {
  for (const options of [{ headers: { "Sec-GPC": "1" } }, { headers: { DNT: "1" } }, { cf: { country: "DE" } }, { cf: { botManagement: { verifiedBot: true } } }, { cf: { botManagement: { score: 20 } } }]) {
    const { env, points } = environment();
    assert.equal((await onRequestPost({ request: request(base, options), env })).status, 204);
    assert.equal(points.length, 0);
    assert.equal(env.MEASUREMENT_DB.sqlite.prepare("SELECT count(*) AS n FROM measurement_sessions").get().n, 0);
  }
});

test("server rejects fabricated stages, extra fields, arbitrary dimensions, old schemas and cross-origin payloads", async () => {
  for (const overrides of [{ event: "lead_submitted" }, { email: "private@example.com" }, { source: "person" }, { page: "/person" }, { placement: "person" }, { intent: "person" }, { schema_version: "1" }, { session_id: "not-a-uuid" }, { session_id: [ID] }]) assert.equal(normalizePayload({ ...base, ...overrides }), null);
  assert.equal((await onRequestPost({ request: request(base, { headers: { Origin: "https://attacker.example" } }), env: {} })).status, 403);
  assert.equal((await onRequestPost({ request: request(base, { headers: { "Content-Type": "text/plain" } }), env: {} })).status, 415);
  assert.equal((await onRequestPost({ request: request("x".repeat(MAX_BODY_BYTES + 1)), env: {} })).status, 413);
});

test("health requires both bindings; a database failure does not silently inflate counts", async () => {
  const { env, points } = environment();
  assert.deepEqual(await (await onRequestGet({ env })).json(), { status: "ok", durable_storage: true, session_deduplication: true, schema_version: "2" });
  assert.equal((await (await onRequestGet({ env: {} })).json()).status, "configuration_required");
  assert.equal((await onRequestPost({ request: request(), env: {} })).status, 503);
  env.MEASUREMENT_DB.batch = async () => { throw new Error("database unavailable"); };
  assert.equal((await onRequestPost({ request: request(), env })).status, 503);
  assert.equal(points.length, 0);
});

test("foreground time and meaningful clicks cause engagement; hidden time and synthetic events do not", async () => {
  const { win, beacons } = browser(); const listeners = new Map(); let tick;
  win.setInterval = (callback) => { tick = callback; return 1; };
  const doc = { visibilityState: "hidden", hasFocus: () => true, addEventListener: (k,v) => listeners.set(k,v), getElementById: () => null };
  setupConversionAnalytics(win, doc);
  tick(); assert.equal(beacons.length, 0);
  doc.visibilityState = "visible"; listeners.get("visibilitychange")();
  const link = { getAttribute: (name) => name === "href" ? "/get-started?intent=enterprise-pilot" : null, closest: () => null };
  listeners.get("click")({ isTrusted: false, target: { closest: () => link } });
  assert.equal(beacons.length, 1);
  listeners.get("click")({ isTrusted: true, target: { closest: () => link } });
  const payloads = await Promise.all(beacons.map(async ({ body }) => JSON.parse(await body.text())));
  assert.deepEqual(payloads.map((p) => p.event), ["session_started", "engaged_session", "briefing_cta_clicked"]);
});

test("15 seconds of focused foreground viewing emits engagement once", async (t) => {
  let time = NOW; t.mock.method(Date, "now", () => time);
  const { win, beacons } = browser(); let tick; let focused = true; let clears = 0;
  win.setInterval = (callback) => { tick = callback; return 1; };
  win.clearInterval = () => { clears++; };
  const doc = { visibilityState: "visible", hasFocus: () => focused, addEventListener: () => {}, getElementById: () => null };
  setupConversionAnalytics(win, doc);
  for (let i = 0; i < 10; i++) { time += 1000; tick(); }
  focused = false;
  for (let i = 0; i < 30; i++) { time += 1000; tick(); }
  assert.equal(beacons.length, 1);
  focused = true;
  for (let i = 0; i < 5; i++) { time += 1000; tick(); }
  assert.equal(beacons.length, 2); assert.equal(clears, 1);
  assert.equal(JSON.parse(await beacons[1].body.text()).event, "engaged_session");
});
