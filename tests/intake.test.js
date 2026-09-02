import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import {
  INTAKE_RECIPIENT,
  INTAKE_SENDER,
  MAX_BODY_BYTES,
  SES_PATH,
  normalizeFormBody,
  onRequestGet,
  onRequestPost,
} from "../functions/api/intake.js";

const FIXED_TIME = new Date("2026-09-01T16:00:00.000Z");
const SES_ENV = Object.freeze({
  AWS_SES_REGION: "us-east-1",
  AWS_SES_ACCESS_KEY_ID: "AKIDEXAMPLE12345678",
  AWS_SES_SECRET_ACCESS_KEY: "test-secret-access-key-not-used-outside-tests",
});

function expectedAuthorization(body, configuration, now) {
  const region = configuration.AWS_SES_REGION;
  const host = `email.${region}.amazonaws.com`;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    "content-type:application/json",
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "POST",
    SES_PATH,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
  const dateKey = hmac(`AWS4${configuration.AWS_SES_SECRET_ACCESS_KEY}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "ses");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${configuration.AWS_SES_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

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
  const configured = await onRequestGet({ env: SES_ENV });
  assert.deepEqual(await configured.json(), {
    status: "ok",
    delivery_provider: "aws_ses_v2",
    delivery_configured: true,
    schema_version: "1",
  });

  const missing = await onRequestGet({ env: {} });
  assert.equal((await missing.json()).delivery_configured, false);
  assert.equal(missing.headers.get("Cache-Control"), "no-store");
});

test("accepted SES request is SigV4-signed, redirects, and records one aggregate lead", async () => {
  const calls = [];
  const points = [];
  const response = await onRequestPost({
    request: makeRequest(validForm()),
    env: {
      ...SES_ENV,
      CONVERSION_EVENTS: { writeDataPoint: (point) => points.push(point) },
    },
  }, {
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ MessageId: "01000191a2b3c4d5-example" });
    },
    now: () => FIXED_TIME,
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "https://www.digitranshq.com/intake-thank-you/");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://email.us-east-1.amazonaws.com${SES_PATH}`);
  assert.equal(calls[0].options.headers["X-Amz-Date"], "20260901T160000Z");
  assert.equal(
    calls[0].options.headers.Authorization,
    expectedAuthorization(calls[0].options.body, SES_ENV, FIXED_TIME),
  );

  const message = JSON.parse(calls[0].options.body);
  assert.deepEqual(message.Destination.ToAddresses, [INTAKE_RECIPIENT]);
  assert.equal(message.FromEmailAddress, INTAKE_SENDER);
  assert.deepEqual(message.ReplyToAddresses, ["info@digitranshq.com"]);
  assert.match(message.Content.Simple.Body.Text.Data, /Controlled production validation only\./);
  assert.equal(calls[0].options.body.includes(SES_ENV.AWS_SES_SECRET_ACCESS_KEY), false);

  assert.equal(points.length, 1);
  assert.deepEqual(points[0].blobs, [
    "lead_submitted",
    "/intake-thank-you/",
    "aws_ses_intake",
    "enterprise-pilot",
    "1",
  ]);
});

test("SES acceptance succeeds but provider rejection fails closed", async () => {
  const accepted = await onRequestPost({
    request: makeRequest(validForm()),
    env: SES_ENV,
  }, {
    fetch: async () => Response.json({ MessageId: "accepted-message-id" }),
    now: () => FIXED_TIME,
  });
  assert.equal(accepted.headers.get("Location"), "https://www.digitranshq.com/intake-thank-you/");

  const rejected = await onRequestPost({
    request: makeRequest(validForm()),
    env: SES_ENV,
  }, {
    fetch: async () => Response.json({
      __type: "com.amazon.coral.service#AccessDeniedException",
      message: "Access denied",
    }, { status: 403 }),
    now: () => FIXED_TIME,
  });
  assert.equal(
    rejected.headers.get("Location"),
    "https://www.digitranshq.com/get-started?status=delivery-unavailable#intake",
  );
  assert.equal(
    rejected.headers.get("X-DigiTrust-Delivery-Diagnostic"),
    "provider-403-AccessDeniedException",
  );
  assert.equal(rejected.headers.get("Cache-Control"), "no-store");
});

test("SES transport failures expose only a categorical diagnostic", async () => {
  const response = await onRequestPost({
    request: makeRequest(validForm()),
    env: SES_ENV,
  }, {
    fetch: async () => {
      throw new Error("sensitive provider detail");
    },
    now: () => FIXED_TIME,
  });

  assert.equal(
    response.headers.get("X-DigiTrust-Delivery-Diagnostic"),
    "provider-request-failed",
  );
  assert.equal(JSON.stringify([...response.headers]).includes("sensitive provider detail"), false);
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
  assert.equal(
    response.headers.get("X-DigiTrust-Delivery-Diagnostic"),
    "configuration-missing",
  );
});

test("honeypot submissions receive a neutral redirect without email or analytics", async () => {
  let contacted = false;
  const points = [];
  const response = await onRequestPost({
    request: makeRequest(validForm({ website_check: "automated" })),
    env: {
      ...SES_ENV,
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
