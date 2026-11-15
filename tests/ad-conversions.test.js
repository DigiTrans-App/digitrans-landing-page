import assert from "node:assert/strict";
import test from "node:test";
import { CONSENT_KEY, RECEIPT_COOKIE, PIXEL_ID, setupAdConversions } from "../assets/ad-conversions.js";

const NOW = 1794750000000;
const ID = "12345678-1234-4123-8123-123456789abc";
function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
function browser({ receipt = `${ID}.${NOW}`, consent = true, path = "/intake-thank-you/" } = {}) {
  const cookies = new Map(receipt ? [[RECEIPT_COOKIE, receipt]] : []);
  const scripts = []; const requests = []; const listeners = {};
  const choice = { checked: false, disabled: false, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const status = { textContent: "" };
  const win = {
    location: new URL(`https://www.digitranshq.com${path}`), navigator: {}, localStorage: storage(), sessionStorage: storage(),
    addEventListener: () => {},
    fetch: async (...args) => { requests.push(args); return Response.json({ ad_measurement_allowed: true }); },
  };
  if (consent) win.sessionStorage.setItem(CONSENT_KEY, "granted");
  const doc = {
    get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
    set cookie(value) { const [pair] = value.split(";"); const index = pair.indexOf("="); const key = pair.slice(0, index); if (value.includes("Max-Age=0")) cookies.delete(key); else cookies.set(key, pair.slice(index + 1)); },
    head: { appendChild: (node) => scripts.push(node) }, createElement: () => ({}),
    getElementById: (id) => id === "ad_measurement_consent" && path === "/readiness-check/" ? choice : id === "ad-measurement-status" ? status : null,
  };
  return { win, doc, scripts, requests, choice, listeners, cookies, status };
}

test("only a fresh accepted receipt plus consent emits one lead with an event ID and no form values", async () => {
  const b = browser();
  assert.equal(await setupAdConversions(b.win, b.doc, () => NOW).result, true);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, "https://bzrcdn.openai.com/sdk/oaiq.min.js");
  assert.deepEqual(b.win.oaiq.q.map((args) => [...args]), [
    ["consent", true], ["init", { pixelId: PIXEL_ID }],
    ["measure", "lead_created", { type: "customer_action" }, { event_id: ID, opt_out: true }],
  ]);
  assert.equal(await setupAdConversions(b.win, b.doc, () => NOW).result, false);
  assert.equal(b.win.oaiq.q.filter((args) => args[0] === "measure").length, 1);
});

test("direct, malformed, expired, future, and unconsented visits never load the SDK or create leads", async () => {
  for (const options of [{ receipt: "" }, { receipt: "forged" }, { receipt: `${ID}.${NOW - 120001}` }, { receipt: `${ID}.${NOW + 1}` }, { consent: false }]) {
    const b = browser(options);
    assert.equal(await setupAdConversions(b.win, b.doc, () => NOW).result, false);
    assert.equal(b.scripts.length, 0); assert.equal(b.requests.length, 0);
  }
});

test("internal, automated, privacy-signaled and preview browsers do not contact the Pixel", async () => {
  for (const change of [
    (b) => { b.win.navigator.globalPrivacyControl = true; },
    (b) => { b.win.navigator.doNotTrack = "1"; },
    (b) => { b.win.navigator.webdriver = true; },
    (b) => { b.win.location.hash = "#analytics=off"; },
    (b) => b.win.localStorage.setItem("digitrust_measurement_excluded", "1"),
    (b) => { b.win.location.hostname = "preview.digitranshq.pages.dev"; },
  ]) {
    const b = browser(); change(b);
    assert.equal(await setupAdConversions(b.win, b.doc, () => NOW).result, false);
    assert.equal(b.scripts.length, 0); assert.equal(b.requests.length, 0);
  }
});

test("regional denial and unavailable checks fail closed without blocking the page", async () => {
  for (const fetch of [async () => Response.json({ ad_measurement_allowed: false }), async () => { throw new Error("offline"); }]) {
    const b = browser(); b.win.fetch = fetch;
    assert.equal(await setupAdConversions(b.win, b.doc, () => NOW).result, false);
    assert.equal(b.scripts.length, 0);
  }
});

test("revocation while the regional check is pending prevents script loading", async () => {
  const b = browser(); let resolve;
  b.win.fetch = () => new Promise((done) => { resolve = done; });
  const state = setupAdConversions(b.win, b.doc, () => NOW);
  state.revoke(); resolve(Response.json({ ad_measurement_allowed: true }));
  assert.equal(await state.result, false); assert.equal(b.scripts.length, 0);
});

test("the optional checkbox does not load before consent and can revoke and restore it", async () => {
  const b = browser({ path: "/readiness-check/", consent: false, receipt: "" });
  const state = setupAdConversions(b.win, b.doc, () => NOW);
  await state.result;
  assert.equal(b.choice.checked, false); assert.equal(b.scripts.length, 0);
  b.choice.checked = true; b.listeners.change(); await new Promise((done) => setImmediate(done));
  assert.equal(b.scripts.length, 1); assert.equal(b.win.sessionStorage.getItem(CONSENT_KEY), "granted");
  b.choice.checked = false; b.listeners.change();
  assert.equal(b.win.sessionStorage.getItem(CONSENT_KEY), null);
  assert.deepEqual([...b.win.oaiq.q.at(-1)], ["consent", false]);
  b.choice.checked = true; b.listeners.change(); await new Promise((done) => setImmediate(done));
  assert.equal(b.scripts.length, 1);
  assert.deepEqual([...b.win.oaiq.q.at(-1)], ["consent", true]);
  assert.equal(b.win.oaiq.q.some((args) => args[0] === "measure"), false);
});
