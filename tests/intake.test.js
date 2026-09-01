import assert from "node:assert/strict";
import test from "node:test";

import {
  EMAIL_ENDPOINT,
  INTAKE_RECIPIENT,
  INTAKE_SENDER,
  MAX_BODY_BYTES,
  normalizeFormBody,
  onRequestGet,
  onRequestPost,
} from "../functions/api/intake.js";

function validForm(overrides = {}) {
  return new URLSearchParams({
    full_name: "DigiTrans Production Check",
    email: "info@digitranshq.com",
    company: "DigiTrans LLC",
    role: "QA",
    workflow_type: "Other",
    business_goal: "Controlled production validation only.",
    consent: "Agreed",
    intent: "enterprise-pilot",
    utm_source: "production-check",
    utm_medium: "qa",
    utm_campaign: "intake-verification",
    utm_term: "",
    utm_content: "",
    referrer: "direct",
    landing_page: "https://www.digitranshq.com/get-started",
    source_path: "/get-started",
    website_check: "",
    ...overrides,
  }).toString();
}

function makeRequest(body, options = {}) {
  return new Request("https://www.digitranshq.com/api/intake", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: options.origin || "https://www.digitranshq.com",
      ...(options.headers || {}),
    },
    body,
  });
}

test("intake normalization accepts only the documented fields and choices", () => {
  const intake = normalizeFormBody(validForm());
  assert.equal(intake.fullName, "DigiTrans Production Check");
  assert.equal(intake.email, "info@digitranshq.com");
  assert.equal(intake.intent, "enterprise-pilot");
  assert.equal(intake.attribution.utm_source, "production-check");

  assert.equal(normalizeFormBody(`${validForm()}&email=duplicate@example.com`), null);
  assert.equal(normalizeFormBody(`${validForm()}&unexpected=value`), null);
  assert.equal(normalizeFormBody(validForm({ consent: "" })), null);
  assert.equal(normalizeFormBody(validForm({ email: "not-an-email" })), null);
  assert.equal(normalizeFormBody(validForm({ workflow_type: "Invented workflow" })), null);
});

test("intake health exposes configuration state without sending email", async () => {
  const configured = await onRequestGet({ env: { INTAKE_EMAIL_TOKEN: "secret" } });
  assert.deepEqual(await configured.json(), {
    status: "ok",
    delivery_provider: "cloudflare_email_service",
    delivery_configured: true,
    schema_version: "1",
  });

  const missing = await onRequestGet({ env: {} });
  assert.equal((await missing.json()).delivery_configured, false);
  assert.equal(missing.headers.get("Cache-Control"), "no-store");
});

test("accepted Cloudflare delivery redirects and records one aggregate lead", async () => {
  const calls = [];
  const points = [];
  const response = await onRequestPost({
    request: makeRequest(validForm()),
    env: {
      INTAKE_EMAIL_TOKEN: "email-token",
      CONVERSION_EVENTS: { writeDataPoint: (point) => points.push(point) },
    },
  }, {
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        success: true,
        errors: [],
        messages: [],
        result: { delivered: [INTAKE_RECIPIENT], permanent_bounces: [], queued: [] },
      });
    },
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "https://www.digitranshq.com/intake-thank-you/");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, EMAIL_ENDPOINT);
  assert.equal(calls[0].options.headers.Authorization, "Bearer email-token");

  const message = JSON.parse(calls[0].options.body);
  assert.equal(message.to, INTAKE_RECIPIENT);
  assert.equal(message.from, INTAKE_SENDER);
  assert.equal(message.reply_to, "info@digitranshq.com");
  assert.match(message.text, /Controlled production validation only\./);
  assert.equal(calls[0].options.body.includes("email-token"), false);

  assert.equal(points.length, 1);
  assert.deepEqual(points[0].blobs, [
    "lead_submitted",
    "/intake-thank-you/",
    "cloudflare_intake",
    "enterprise-pilot",
    "1",
  ]);
});

test("queued delivery is accepted but a bounce or provider failure fails closed", async () => {
  const queued = await onRequestPost({
    request: makeRequest(validForm()),
    env: { INTAKE_EMAIL_TOKEN: "email-token" },
  }, {
    fetch: async () => Response.json({
      success: true,
      result: { delivered: [], permanent_bounces: [], queued: [INTAKE_RECIPIENT] },
    }),
  });
  assert.equal(queued.headers.get("Location"), "https://www.digitranshq.com/intake-thank-you/");

  const rejected = await onRequestPost({
    request: makeRequest(validForm()),
    env: { INTAKE_EMAIL_TOKEN: "email-token" },
  }, {
    fetch: async () => Response.json({
      success: false,
      errors: [{ code: 10102 }],
      result: null,
    }, { status: 403 }),
  });
  assert.equal(
    rejected.headers.get("Location"),
    "https://www.digitranshq.com/get-started?status=delivery-unavailable#intake",
  );
});

test("missing email configuration fails closed without contacting a provider", async () => {
  let contacted = false;
  const response = await onRequestPost({
    request: makeRequest(validForm()),
    env: {},
  }, {
    fetch: async () => {
      contacted = true;
      return Response.json({});
    },
  });

  assert.equal(contacted, false);
  assert.equal(
    response.headers.get("Location"),
    "https://www.digitranshq.com/get-started?status=delivery-unavailable#intake",
  );
});

test("honeypot submissions receive a neutral redirect without email or analytics", async () => {
  let contacted = false;
  const points = [];
  const response = await onRequestPost({
    request: makeRequest(validForm({ website_check: "automated" })),
    env: {
      INTAKE_EMAIL_TOKEN: "email-token",
      CONVERSION_EVENTS: { writeDataPoint: (point) => points.push(point) },
    },
  }, {
    fetch: async () => {
      contacted = true;
      return Response.json({});
    },
  });

  assert.equal(response.headers.get("Location"), "https://www.digitranshq.com/intake-thank-you/");
  assert.equal(contacted, false);
  assert.equal(points.length, 0);
});

test("intake endpoint rejects cross-origin, unsupported, and oversized requests", async () => {
  const crossOrigin = await onRequestPost({
    request: makeRequest(validForm(), { origin: "https://attacker.example" }),
    env: {},
  });
  assert.equal(crossOrigin.status, 403);

  const unsupported = await onRequestPost({
    request: makeRequest(validForm(), { headers: { "Content-Type": "application/json" } }),
    env: {},
  });
  assert.equal(unsupported.status, 415);

  const oversized = await onRequestPost({
    request: makeRequest("x".repeat(MAX_BODY_BYTES + 1)),
    env: {},
  });
  assert.equal(oversized.status, 413);
});
