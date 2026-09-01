const ALLOWED_EVENTS = new Set([
  "trust_record_clicked",
  "briefing_cta_clicked",
  "intake_started",
  "lead_submitted",
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

const ALLOWED_KEYS = new Set(["event", "page", "placement", "intent", "schema_version"]);
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SAFE_PATH = /^\/[a-zA-Z0-9._~!$&'()*+,;=:@%\/-]*$/;
const MAX_BODY_BYTES = 1024;

function jsonResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) return null;
  if (!ALLOWED_EVENTS.has(value.event)) return null;
  if (value.schema_version !== "1") return null;
  if (typeof value.page !== "string" || value.page.length > 160 || !SAFE_PATH.test(value.page)) return null;
  if (typeof value.placement !== "string" || !SAFE_SLUG.test(value.placement)) return null;
  if (typeof value.intent !== "string" || !ALLOWED_INTENTS.has(value.intent)) return null;

  return {
    event: value.event,
    page: value.page,
    placement: value.placement,
    intent: value.intent,
    schemaVersion: value.schema_version,
  };
}

function requestHasSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch (error) {
    return false;
  }
}

function recordEvent(dataset, event) {
  if (!dataset || typeof dataset.writeDataPoint !== "function") return false;

  dataset.writeDataPoint({
    blobs: [event.event, event.page, event.placement, event.intent, event.schemaVersion],
    doubles: [1],
    indexes: [crypto.randomUUID()],
  });
  return true;
}

export function onRequestGet(context) {
  const durableStorage = Boolean(
    context.env
    && context.env.CONVERSION_EVENTS
    && typeof context.env.CONVERSION_EVENTS.writeDataPoint === "function",
  );

  return Response.json({
    status: "ok",
    durable_storage: durableStorage,
    schema_version: "1",
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestPost(context) {
  const { request } = context;
  if (!requestHasSameOrigin(request)) return jsonResponse(403, "Forbidden");
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse(415, "Unsupported media type");
  }

  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (declaredLength > MAX_BODY_BYTES) return jsonResponse(413, "Payload too large");

  let rawBody;
  try {
    rawBody = await request.text();
  } catch (error) {
    return jsonResponse(400, "Invalid request");
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(413, "Payload too large");
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    return jsonResponse(400, "Invalid JSON");
  }

  const event = normalizePayload(payload);
  if (!event) return jsonResponse(400, "Invalid event");

  console.log(JSON.stringify({ type: "digitrust_conversion", ...event }));

  try {
    recordEvent(context.env && context.env.CONVERSION_EVENTS, event);
  } catch (error) {
    console.error("CONVERSION_ANALYTICS_WRITE_FAILED");
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export { MAX_BODY_BYTES, normalizePayload, recordEvent, requestHasSameOrigin };
