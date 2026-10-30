import { SCHEMA_VERSION, SESSION_ID, SOURCES, MEDIUMS, CAMPAIGNS, PATHS, PLACEMENTS } from "../../assets/measurement-schema.js";
import { acceptSessionEvent, requestMeasurementAllowed } from "../_lib/measurement.js";

const ALLOWED_EVENTS = new Set([
  "session_started",
  "engaged_session",
  "assistant_directory_clicked",
  "trust_record_clicked",
  "briefing_cta_clicked",
  "intake_started",
]);

const ALLOWED_INTENTS = new Set([
  "architecture-review",
  "assisted-onboarding",
  "assistant-onboarding",
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

const ALLOWED_KEYS = new Set(["event", "page", "placement", "intent", "schema_version", "session_id", "source", "medium", "campaign"]);
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
  if (value.schema_version !== SCHEMA_VERSION) return null;
  if (!PATHS.includes(value.page) || !PLACEMENTS.includes(value.placement)) return null;
  if (typeof value.intent !== "string" || !ALLOWED_INTENTS.has(value.intent)) return null;
  if (!SESSION_ID.test(value.session_id || "")) return null;
  if (!SOURCES.includes(value.source) || !MEDIUMS.includes(value.medium) || !CAMPAIGNS.includes(value.campaign)) return null;

  return {
    event: value.event,
    page: value.page,
    placement: value.placement,
    intent: value.intent,
    schemaVersion: value.schema_version,
    sessionId: value.session_id,
    source: value.source,
    medium: value.medium,
    campaign: value.campaign,
    audience: "external",
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
    blobs: [event.event, event.page, event.placement, event.intent, event.schemaVersion,
      event.source || "direct_or_unknown", event.medium || "unknown", event.campaign || "none",
      event.audience || "unmeasured"],
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
  const sessionStorage = Boolean(context.env?.MEASUREMENT_DB?.batch);

  return Response.json({
    status: durableStorage && sessionStorage ? "ok" : "configuration_required",
    durable_storage: durableStorage,
    session_deduplication: sessionStorage,
    schema_version: SCHEMA_VERSION,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestPost(context, runtime = {}) {
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
  if (!requestMeasurementAllowed(request)) return new Response(null, { status: 204 });
  if (!context.env?.MEASUREMENT_DB || !context.env?.CONVERSION_EVENTS) return jsonResponse(503, "Measurement unavailable");

  try {
    const accepted = await acceptSessionEvent(context.env.MEASUREMENT_DB, event, runtime.now?.() ?? Date.now());
    if (accepted.expired) return jsonResponse(410, "Session expired");
    for (const item of accepted.events) recordEvent(context.env.CONVERSION_EVENTS, item);
  } catch (error) {
    console.error("CONVERSION_ANALYTICS_WRITE_FAILED");
    return jsonResponse(503, "Measurement unavailable");
  }

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export { MAX_BODY_BYTES, normalizePayload, recordEvent, requestHasSameOrigin };
