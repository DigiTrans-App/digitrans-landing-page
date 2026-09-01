import assert from "node:assert/strict";
import test from "node:test";

import {
  createTracker,
  measurementAllowed,
  normalizeEventPayload,
  setupConversionAnalytics,
} from "../assets/analytics.js";
import { MAX_BODY_BYTES, normalizePayload, onRequestGet, onRequestPost } from "../functions/api/events.js";

test("client payloads contain only allowlisted categorical values", () => {
  const payload = normalizeEventPayload("briefing_cta_clicked", {
    page: "/get-started?email=person@example.com",
    placement: "Hero",
    intent: "enterprise-pilot",
    email: "person@example.com",
  });

  assert.deepEqual(payload, {
    event: "briefing_cta_clicked",
    page: "/get-started",
    placement: "hero",
    intent: "enterprise-pilot",
    schema_version: "1",
  });
  assert.equal(normalizeEventPayload("email_captured", {}), null);
  assert.equal(normalizeEventPayload("intake_started", { intent: "person-name" }).intent, "none");
});

test("global privacy signals suppress measurement", () => {
  assert.equal(measurementAllowed({ globalPrivacyControl: true, doNotTrack: "0" }), false);
  assert.equal(measurementAllowed({ globalPrivacyControl: false, doNotTrack: "1" }), false);
  assert.equal(measurementAllowed({ globalPrivacyControl: false, doNotTrack: "0" }), true);
});

test("tracker sends the same privacy-safe payload to the endpoint and Zaraz", async () => {
  const beacons = [];
  const zarazEvents = [];
  const fakeWindow = {
    Blob,
    fetch: () => Promise.resolve(),
    navigator: {
      doNotTrack: "0",
      globalPrivacyControl: false,
      sendBeacon: (url, body) => {
        beacons.push({ url, body });
        return true;
      },
    },
    zaraz: {
      track: (event, properties) => zarazEvents.push({ event, properties }),
    },
  };

  const track = createTracker({ window: fakeWindow });
  assert.equal(track("trust_record_clicked", { page: "/", placement: "hero", intent: "none" }), true);
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].url, "/api/events");
  assert.deepEqual(JSON.parse(await beacons[0].body.text()), {
    event: "trust_record_clicked",
    page: "/",
    placement: "hero",
    intent: "none",
    schema_version: "1",
  });
  assert.deepEqual(zarazEvents, [{
    event: "trust_record_clicked",
    properties: { page: "/", placement: "hero", intent: "none", schema_version: "1" },
  }]);
});

test("browser wiring records click and intake start without field values", async () => {
  const beacons = [];
  const browserWindow = {
    Blob,
    fetch: () => Promise.resolve(),
    location: {
      origin: "https://www.digitranshq.com",
      pathname: "/get-started",
      search: "?intent=enterprise-pilot",
    },
    navigator: {
      doNotTrack: "0",
      globalPrivacyControl: false,
      sendBeacon: (url, body) => {
        beacons.push({ url, body });
        return true;
      },
    },
  };
  const formListeners = new Map();
  const form = {
    addEventListener: (name, listener) => formListeners.set(name, listener),
    checkValidity: () => true,
  };
  const trap = { value: "" };
  const documentListeners = new Map();
  const browserDocument = {
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    getElementById: (id) => ({ "digitrust-intake": form, website_check: trap })[id] || null,
  };

  setupConversionAnalytics(browserWindow, browserDocument);

  const briefingLink = {
    getAttribute: (name) => ({ href: "/get-started?intent=enterprise-pilot#intake" })[name] || null,
    closest: (selector) => selector === ".launch-hero, .page-hero" ? {} : null,
  };
  documentListeners.get("click")({ target: { closest: () => briefingLink } });
  formListeners.get("focusin")({
    target: { id: "full_name", matches: () => true, value: "Test User" },
  });
  assert.equal(beacons.length, 2);
  const payloads = await Promise.all(beacons.map(async ({ body }) => JSON.parse(await body.text())));
  assert.deepEqual(payloads.map(({ event }) => event), [
    "briefing_cta_clicked",
    "intake_started",
  ]);
  assert.equal(JSON.stringify(payloads).includes("Test User"), false);
});

function makeRequest(body, options = {}) {
  return new Request("https://www.digitranshq.com/api/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.origin || "https://www.digitranshq.com",
      ...(options.headers || {}),
    },
    body,
  });
}

test("event endpoint health reports whether durable storage is connected", async () => {
  const connected = await onRequestGet({
    env: { CONVERSION_EVENTS: { writeDataPoint: () => {} } },
  });
  assert.equal(connected.status, 200);
  assert.deepEqual(await connected.json(), {
    status: "ok",
    durable_storage: true,
    schema_version: "1",
  });
  assert.equal(connected.headers.get("Cache-Control"), "no-store");

  const disconnected = await onRequestGet({ env: {} });
  assert.equal((await disconnected.json()).durable_storage, false);
});

test("event endpoint writes the documented Analytics Engine schema", async () => {
  const points = [];
  const payload = {
    event: "intake_started",
    page: "/get-started",
    placement: "intake_form",
    intent: "enterprise-pilot",
    schema_version: "1",
  };

  const response = await onRequestPost({
    request: makeRequest(JSON.stringify(payload)),
    env: { CONVERSION_EVENTS: { writeDataPoint: (point) => points.push(point) } },
  });

  assert.equal(response.status, 204);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].blobs, [
    "intake_started",
    "/get-started",
    "intake_form",
    "enterprise-pilot",
    "1",
  ]);
  assert.deepEqual(points[0].doubles, [1]);
  assert.equal(points[0].indexes.length, 1);
});

test("event endpoint rejects personal-data fields and cross-origin requests", async () => {
  const personalData = normalizePayload({
    event: "intake_started",
    page: "/get-started",
    placement: "intake_form",
    intent: "enterprise-pilot",
    schema_version: "1",
    email: "person@example.com",
  });
  assert.equal(personalData, null);
  assert.equal(normalizePayload({
    event: "lead_submitted",
    page: "/intake-thank-you/",
    placement: "cloudflare_intake",
    intent: "enterprise-pilot",
    schema_version: "1",
  }), null);
  assert.equal(normalizePayload({
    event: "intake_started",
    page: "/get-started",
    placement: "intake_form",
    intent: "person-name",
    schema_version: "1",
  }), null);

  const crossOrigin = await onRequestPost({
    request: makeRequest("{}", { origin: "https://attacker.example" }),
    env: {},
  });
  assert.equal(crossOrigin.status, 403);
});

test("event endpoint accepts JSON only", async () => {
  const response = await onRequestPost({
    request: makeRequest("{}", { headers: { "Content-Type": "text/plain" } }),
    env: {},
  });
  assert.equal(response.status, 415);
});

test("event endpoint rejects oversized bodies", async () => {
  const response = await onRequestPost({
    request: makeRequest("x".repeat(MAX_BODY_BYTES + 1)),
    env: {},
  });
  assert.equal(response.status, 413);
});
