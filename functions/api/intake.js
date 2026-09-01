import { recordEvent } from "./events.js";

const ACCOUNT_ID = "043f551ad8c039a914503318dae50d87";
const EMAIL_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/sending/send`;
const INTAKE_RECIPIENT = "info@digitranshq.com";
const INTAKE_SENDER = "forms@notify.digitranshq.com";
const MAX_BODY_BYTES = 8192;

const ALLOWED_KEYS = new Set([
  "business_goal",
  "company",
  "consent",
  "email",
  "full_name",
  "intent",
  "landing_page",
  "referrer",
  "role",
  "source_path",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
  "website_check",
  "workflow_type",
]);

const ALLOWED_INTENTS = new Set([
  "architecture-review",
  "aws-cosell-pilot",
  "aws-marketplace-pilot",
  "aws-marketplace-purchasing",
  "aws-validated",
  "defense-safe-pilot",
  "engagement-guidance",
  "enterprise-pilot",
  "financial-services-pilot",
  "healthcare-pilot",
  "none",
  "post-payment",
  "press-release",
  "production-expansion",
  "quickstart",
]);

const ALLOWED_WORKFLOWS = new Set([
  "AI assistant or copilot",
  "AI workflow or automated tool use",
  "Decision support",
  "Customer or patient-facing AI",
  "Fraud, risk, or security analytics",
  "Clinical or research support",
  "Operational automation",
  "Other",
]);

const EMAIL_PATTERN = /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function requestHasSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch (error) {
    return false;
  }
}

function cleanText(value, maximumLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return cleaned.length <= maximumLength ? cleaned : null;
}

function normalizeFormBody(rawBody) {
  const params = new URLSearchParams(rawBody);
  const values = {};

  for (const [key, value] of params) {
    if (!ALLOWED_KEYS.has(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }

  const fullName = cleanText(values.full_name, 120);
  const email = cleanText(values.email, 180);
  const company = cleanText(values.company, 160);
  const role = cleanText(values.role || "", 160);
  const workflowType = cleanText(values.workflow_type, 120);
  const businessGoal = cleanText(values.business_goal || "", 1200);
  const intent = cleanText(values.intent || "none", 64)?.toLowerCase();
  const websiteCheck = cleanText(values.website_check || "", 200);

  if (!fullName || !email || !EMAIL_PATTERN.test(email) || !company) return null;
  if (role === null || businessGoal === null || websiteCheck === null) return null;
  if (!workflowType || !ALLOWED_WORKFLOWS.has(workflowType)) return null;
  if (values.consent !== "Agreed") return null;
  if (!intent || !SAFE_SLUG.test(intent) || !ALLOWED_INTENTS.has(intent)) return null;

  const attribution = {};
  for (const [key, maximumLength] of [
    ["utm_source", 160],
    ["utm_medium", 160],
    ["utm_campaign", 160],
    ["utm_term", 160],
    ["utm_content", 160],
    ["referrer", 500],
    ["landing_page", 500],
    ["source_path", 250],
  ]) {
    const value = cleanText(values[key] || "", maximumLength);
    if (value === null) return null;
    attribution[key] = value;
  }

  return {
    fullName,
    email,
    company,
    role,
    workflowType,
    businessGoal,
    intent,
    websiteCheck,
    attribution,
  };
}

function buildMessage(intake, submissionId, submittedAt) {
  const lines = [
    "New DigiTrust Enterprise Pilot Request",
    "",
    `Submission ID: ${submissionId}`,
    `Submitted at: ${submittedAt}`,
    `Full name: ${intake.fullName}`,
    `Work email: ${intake.email}`,
    `Company: ${intake.company}`,
    `Role or title: ${intake.role || "Not provided"}`,
    `Primary AI workflow: ${intake.workflowType}`,
    `Business goal: ${intake.businessGoal || "Not provided"}`,
    `Intent: ${intake.intent}`,
    "Consent: Agreed",
    "",
    "Campaign attribution",
    `UTM source: ${intake.attribution.utm_source || "Not provided"}`,
    `UTM medium: ${intake.attribution.utm_medium || "Not provided"}`,
    `UTM campaign: ${intake.attribution.utm_campaign || "Not provided"}`,
    `UTM term: ${intake.attribution.utm_term || "Not provided"}`,
    `UTM content: ${intake.attribution.utm_content || "Not provided"}`,
    `Referrer: ${intake.attribution.referrer || "Not provided"}`,
    `Landing page: ${intake.attribution.landing_page || "Not provided"}`,
    `Source path: ${intake.attribution.source_path || "Not provided"}`,
  ];

  return {
    to: INTAKE_RECIPIENT,
    from: INTAKE_SENDER,
    reply_to: intake.email,
    subject: "New DigiTrust Enterprise Pilot Request",
    text: lines.join("\n"),
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-DigiTrust-Submission-ID": submissionId,
    },
  };
}

function deliveryAccepted(payload) {
  if (!payload || payload.success !== true || !payload.result) return false;
  const delivered = Array.isArray(payload.result.delivered) ? payload.result.delivered : [];
  const queued = Array.isArray(payload.result.queued) ? payload.result.queued : [];
  const bounced = Array.isArray(payload.result.permanent_bounces) ? payload.result.permanent_bounces : [];
  return bounced.length === 0 && [...delivered, ...queued].includes(INTAKE_RECIPIENT);
}

async function sendIntakeEmail(intake, token, submissionId, submittedAt, fetchImpl = fetch) {
  const response = await fetchImpl(EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildMessage(intake, submissionId, submittedAt)),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  return {
    accepted: response.ok && deliveryAccepted(payload),
    status: response.status,
    errorCode: payload && Array.isArray(payload.errors) && payload.errors[0]
      ? payload.errors[0].code
      : null,
  };
}

function redirectTo(request, path) {
  return Response.redirect(new URL(path, request.url), 303);
}

function plainResponse(status, message) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function onRequestGet(context) {
  return Response.json({
    status: context.env && context.env.INTAKE_EMAIL_TOKEN ? "ok" : "configuration_required",
    delivery_provider: "cloudflare_email_service",
    delivery_configured: Boolean(context.env && context.env.INTAKE_EMAIL_TOKEN),
    schema_version: "1",
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestPost(context, runtime = {}) {
  const { request } = context;
  if (!requestHasSameOrigin(request)) return plainResponse(403, "Forbidden");

  const contentType = request.headers.get("Content-Type")?.toLowerCase() || "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return plainResponse(415, "Unsupported media type");
  }

  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (declaredLength > MAX_BODY_BYTES) return plainResponse(413, "Payload too large");

  let rawBody;
  try {
    rawBody = await request.text();
  } catch (error) {
    return plainResponse(400, "Invalid request");
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return plainResponse(413, "Payload too large");
  }

  const intake = normalizeFormBody(rawBody);
  if (!intake) return redirectTo(request, "/get-started?status=invalid#intake");

  if (intake.websiteCheck) {
    return redirectTo(request, "/intake-thank-you/");
  }

  const token = context.env && context.env.INTAKE_EMAIL_TOKEN;
  if (!token) {
    console.error("INTAKE_EMAIL_CONFIGURATION_MISSING");
    return redirectTo(request, "/get-started?status=delivery-unavailable#intake");
  }

  const submissionId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  let delivery;
  try {
    delivery = await sendIntakeEmail(
      intake,
      token,
      submissionId,
      submittedAt,
      runtime.fetch || fetch,
    );
  } catch (error) {
    console.error("INTAKE_EMAIL_REQUEST_FAILED");
    return redirectTo(request, "/get-started?status=delivery-unavailable#intake");
  }

  if (!delivery.accepted) {
    console.error(JSON.stringify({
      type: "digitrust_intake_delivery",
      status: "rejected",
      provider_status: delivery.status,
      provider_error_code: delivery.errorCode,
      submission_id: submissionId,
    }));
    return redirectTo(request, "/get-started?status=delivery-unavailable#intake");
  }

  console.log(JSON.stringify({
    type: "digitrust_intake_delivery",
    status: "accepted",
    submission_id: submissionId,
  }));

  try {
    recordEvent(context.env && context.env.CONVERSION_EVENTS, {
      event: "lead_submitted",
      page: "/intake-thank-you/",
      placement: "cloudflare_intake",
      intent: intake.intent,
      schemaVersion: "1",
    });
  } catch (error) {
    console.error("CONVERSION_ANALYTICS_WRITE_FAILED");
  }

  return redirectTo(request, "/intake-thank-you/");
}

export {
  EMAIL_ENDPOINT,
  INTAKE_RECIPIENT,
  INTAKE_SENDER,
  MAX_BODY_BYTES,
  buildMessage,
  deliveryAccepted,
  normalizeFormBody,
  requestHasSameOrigin,
  sendIntakeEmail,
};
