import assert from "node:assert/strict";
import test from "node:test";
import { setupIntakeVerification } from "../assets/intake-verification.js";

test("the widget gates the native form and resets on expiry and back navigation", async () => {
  let config; const listeners = new Map(); const windowListeners = new Map(); let token = ""; let resets = 0;
  const button = { disabled: false }; const status = { hidden: true };
  const form = { querySelector: () => button, addEventListener: (name, handler, capture) => { assert.equal(capture, true); listeners.set(name, handler); } };
  const doc = { getElementById: (id) => ({ "digitrust-intake": form, "intake-verification": {}, "intake-status": status })[id] };
  const win = { fetch: async () => Response.json({ verification_configured: true, turnstile_site_key: "public-sitekey" }), addEventListener: (k,v) => windowListeners.set(k,v), turnstile: { render: (_node, options) => { config = options; return 1; }, getResponse: () => token, reset: () => { resets++; } } };
  await setupIntakeVerification(win, doc);
  assert.equal(button.disabled, true); assert.equal(config.action, "intake");
  let prevented = 0; const event = { preventDefault: () => prevented++, stopImmediatePropagation: () => {} };
  listeners.get("submit")(event); assert.equal(prevented, 1);
  token = "fresh-token"; config.callback(); assert.equal(button.disabled, false);
  listeners.get("submit")(event); assert.equal(prevented, 1);
  config["expired-callback"](); assert.equal(button.disabled, true);
  config.callback(); windowListeners.get("pageshow")({ persisted: true });
  assert.equal(resets, 1); assert.equal(button.disabled, true);
});

test("verification service failure leaves a clear email alternative and blocks unverified submission", async () => {
  const button = {}; const status = {};
  const form = { querySelector: () => button, addEventListener: () => {} };
  await setupIntakeVerification({ fetch: async () => { throw new Error("unavailable"); }, addEventListener: () => {} }, { getElementById: (id) => ({ "digitrust-intake": form, "intake-verification": {}, "intake-status": status })[id] });
  assert.equal(button.disabled, true); assert.equal(status.hidden, false);
  assert.match(status.textContent, /info@digitranshq.com/);
});
