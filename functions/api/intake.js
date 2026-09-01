import { recordEvent } from "./events.js";

const AWS_SERVICE = "ses";
const AWS_TERMINATOR = "aws4_request";
const SES_PATH = "/v2/email/outbound-emails";
const INTAKE_RECIPIENT = "info@digitranshq.com";
const INTAKE_SENDER = "forms@notify.digitranshq.com";
const MAX_BODY_BYTES = 8192;
const REGION_PATTERN = /^(?:af|ap|ca|cn|eu|il|me|mx|sa|us)(?:-gov)?-[a-z0-9-]+-\d$/;
const encoder = new TextEncoder();

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

function buildMessageText(intake, submissionId, submittedAt) {
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

  return lines.join("\n");
}

function buildMessage(intake, submissionId, submittedAt) {
  return {
    FromEmailAddress: INTAKE_SENDER,
    Destination: {
      ToAddresses: [INTAKE_RECIPIENT],
    },
    ReplyToAddresses: [intake.email],
    Content: {
      Simple: {
        Subject: {
          Charset: "UTF-8",
          Data: "New DigiTrust Enterprise Pilot Request",
        },
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: buildMessageText(intake, submissionId, submittedAt),
          },
        },
        Headers: [
          { Name: "Auto-Submitted", Value: "auto-generated" },
          { Name: "X-DigiTrust-Submission-ID", Value: submissionId },
        ],
      },
    },
  };
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function hmacSha256(key, value) {
  const keyBytes = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}

function loadSesConfiguration(env = {}) {
  const region = typeof env.AWS_SES_REGION === "string" ? env.AWS_SES_REGION.trim() : "";
  const accessKeyId = typeof env.AWS_SES_ACCESS_KEY_ID === "string"
    ? env.AWS_SES_ACCESS_KEY_ID.trim()
    : "";
  const secretAccessKey = typeof env.AWS_SES_SECRET_ACCESS_KEY === "string"
    ? env.AWS_SES_SECRET_ACCESS_KEY.trim()
    : "";
  const sessionToken = typeof env.AWS_SES_SESSION_TOKEN === "string"
    ? env.AWS_SES_SESSION_TOKEN.trim()
    : "";

  if (!REGION_PATTERN.test(region) || !accessKeyId || !secretAccessKey) return null;
  return { region, accessKeyId, secretAccessKey, sessionToken };
}

function formatAmzDate(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

async function signSesRequest(body, configuration, now = new Date()) {
  const { region, accessKeyId, secretAccessKey, sessionToken } = configuration;
  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}${SES_PATH}`;
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256(body);
  const canonicalHeaderValues = {
    "content-type": "application/json",
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (sessionToken) canonicalHeaderValues["x-amz-security-token"] = sessionToken;

  const signedHeaders = Object.keys(canonicalHeaderValues).sort();
  const canonicalHeaders = signedHeaders
    .map((name) => `${name}:${canonicalHeaderValues[name]}\n`)
    .join("");
  const canonicalRequest = [
    "POST",
    SES_PATH,
    "",
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${AWS_SERVICE}/${AWS_TERMINATOR}`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");
  const dateKey = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, AWS_SERVICE);
  const signingKey = await hmacSha256(serviceKey, AWS_TERMINATOR);
  const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));
  const headers = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
    "Content-Type": "application/json",
    "X-Amz-Content-Sha256": payloadHash,
    "X-Amz-Date": amzDate,
  };
  if (sessionToken) headers["X-Amz-Security-Token"] = sessionToken;

  return { endpoint, headers };
}

function sanitizeProviderErrorCode(payload) {
  const rawCode = payload && (payload.code || payload.Code || payload.__type);
  if (typeof rawCode !== "string") return null;
  const code = rawCode.split("#").pop();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : null;
}

async function sendIntakeEmail(
  intake,
  configuration,
  submissionId,
  submittedAt,
  fetchImpl = fetch,
  now = new Date(),
) {
  const body = JSON.stringify(buildMessage(intake, submissionId, submittedAt));
  const signedRequest = await signSesRequest(body, configuration, now);
  const response = await fetchImpl(signedRequest.endpoint, {
    method: "POST",
    headers: signedRequest.headers,
    body,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  return {
    accepted: response.ok && payload && typeof payload.MessageId === "string" && payload.MessageId.length > 0,
    status: response.status,
    errorCode: sanitizeProviderErrorCode(payload),
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
  const configuration = loadSesConfiguration(context.env);
  return Response.json({
    status: configuration ? "ok" : "configuration_required",
    delivery_provider: "aws_ses_v2",
    delivery_configured: Boolean(configuration),
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

  const contentType = request.headers.get("Content-Type")?.toLowerCase().split(";", 1)[0].trim() || "";
  if (contentType !== "application/x-www-form-urlencoded") {
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

  const sesConfiguration = loadSesConfiguration(context.env);
  if (!sesConfiguration) {
    console.error("AWS_SES_CONFIGURATION_MISSING");
    return redirectTo(request, "/get-started?status=delivery-unavailable#intake");
  }

  const submissionId = crypto.randomUUID();
  const requestTime = runtime.now ? runtime.now() : new Date();
  const submittedAt = requestTime.toISOString();
  let delivery;
  try {
    delivery = await sendIntakeEmail(
      intake,
      sesConfiguration,
      submissionId,
      submittedAt,
      runtime.fetch || fetch,
      requestTime,
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
      placement: "aws_ses_intake",
      intent: intake.intent,
      schemaVersion: "1",
    });
  } catch (error) {
    console.error("CONVERSION_ANALYTICS_WRITE_FAILED");
  }

  return redirectTo(request, "/intake-thank-you/");
}

export {
  AWS_SERVICE,
  INTAKE_RECIPIENT,
  INTAKE_SENDER,
  MAX_BODY_BYTES,
  SES_PATH,
  buildMessage,
  buildMessageText,
  loadSesConfiguration,
  normalizeFormBody,
  requestHasSameOrigin,
  sanitizeProviderErrorCode,
  sendIntakeEmail,
  signSesRequest,
};
