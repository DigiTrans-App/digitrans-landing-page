const EVENT_NAMES = Object.freeze([
  "trust_record_clicked",
  "briefing_cta_clicked",
  "intake_started",
  "lead_submitted",
]);

const EVENT_SET = new Set(EVENT_NAMES);
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
const EVENT_ENDPOINT = "/api/events";
const SUBMISSION_PENDING_KEY = "digitrust_submission_pending";
const SUBMISSION_PENDING_MAX_AGE_MS = 30 * 60 * 1000;
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SAFE_PATH = /^\/[a-zA-Z0-9._~!$&'()*+,;=:@%\/-]*$/;

function normalizeSlug(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  return SAFE_SLUG.test(normalized) ? normalized : fallback;
}

function normalizePath(value) {
  try {
    const path = new URL(String(value || "/"), "https://analytics.invalid").pathname;
    return path.length <= 160 && SAFE_PATH.test(path) ? path : "/";
  } catch (error) {
    return "/";
  }
}

function normalizeIntent(value) {
  const normalized = normalizeSlug(value, "none");
  return ALLOWED_INTENTS.has(normalized) ? normalized : "none";
}

function normalizeEventPayload(eventName, properties = {}) {
  if (!EVENT_SET.has(eventName)) return null;

  return {
    event: eventName,
    page: normalizePath(properties.page),
    placement: normalizeSlug(properties.placement),
    intent: normalizeIntent(properties.intent),
    schema_version: "1",
  };
}

function measurementAllowed(browserNavigator) {
  if (!browserNavigator) return true;
  return browserNavigator.globalPrivacyControl !== true && browserNavigator.doNotTrack !== "1";
}

function createTracker(runtime = {}) {
  const browserWindow = runtime.window || globalThis.window;
  const browserNavigator = runtime.navigator || browserWindow.navigator;
  const browserFetch = runtime.fetch || browserWindow.fetch;
  const browserBlob = runtime.Blob || browserWindow.Blob;

  return function trackConversion(eventName, properties = {}) {
    if (!measurementAllowed(browserNavigator)) return false;

    const payload = normalizeEventPayload(eventName, properties);
    if (!payload) return false;

    const body = JSON.stringify(payload);
    let queued = false;

    try {
      if (typeof browserNavigator.sendBeacon === "function") {
        const content = new browserBlob([body], { type: "application/json" });
        queued = browserNavigator.sendBeacon(EVENT_ENDPOINT, content);
      }
    } catch (error) {
      queued = false;
    }

    if (!queued && typeof browserFetch === "function") {
      browserFetch(EVENT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "omit",
        keepalive: true,
      }).catch(() => {
        // Measurement must never interrupt navigation or form submission.
      });
      queued = true;
    }

    try {
      if (browserWindow.zaraz && typeof browserWindow.zaraz.track === "function") {
        browserWindow.zaraz.track(eventName, {
          page: payload.page,
          placement: payload.placement,
          intent: payload.intent,
          schema_version: payload.schema_version,
        });
      }
    } catch (error) {
      // Zaraz is an optional mirror; the same-origin endpoint remains primary.
    }

    return queued;
  };
}

function getLinkIntent(link, browserWindow) {
  try {
    return new URL(link.getAttribute("href"), browserWindow.location.origin).searchParams.get("intent") || "none";
  } catch (error) {
    return "none";
  }
}

function getPageIntent(browserWindow) {
  try {
    return new URLSearchParams(browserWindow.location.search).get("intent") || "none";
  } catch (error) {
    return "none";
  }
}

function inferPlacement(link) {
  const explicit = link.getAttribute("data-analytics-placement");
  if (explicit) return normalizeSlug(explicit);
  if (link.closest("nav")) return "navigation";
  if (link.closest(".launch-hero, .page-hero")) return "hero";
  if (link.closest(".pilot-summary")) return "pilot_summary";
  if (link.closest("#pilot")) return "pilot";
  if (link.closest(".launch-cta")) return "closing";
  if (link.closest(".marketplace-card")) return "marketplace";
  if (link.closest(".industry-card")) return "industry";
  return "page";
}

function isBriefingLink(link, browserWindow) {
  try {
    const path = new URL(link.getAttribute("href"), browserWindow.location.origin).pathname.replace(/\.html$/, "");
    return path.replace(/\/$/, "") === "/get-started";
  } catch (error) {
    return false;
  }
}

function markSubmissionPending(storage, now = Date.now()) {
  try {
    storage.setItem(SUBMISSION_PENDING_KEY, String(now));
    return true;
  } catch (error) {
    return false;
  }
}

function consumeSubmissionPending(storage, now = Date.now()) {
  try {
    const createdAt = Number(storage.getItem(SUBMISSION_PENDING_KEY));
    storage.removeItem(SUBMISSION_PENDING_KEY);
    return Number.isFinite(createdAt) && createdAt > 0 && now >= createdAt && now - createdAt <= SUBMISSION_PENDING_MAX_AGE_MS;
  } catch (error) {
    return false;
  }
}

function setupConversionAnalytics(browserWindow = window, browserDocument = document) {
  const track = createTracker({ window: browserWindow });
  const page = normalizePath(browserWindow.location.pathname);

  browserDocument.addEventListener("click", (event) => {
    const link = event.target && typeof event.target.closest === "function"
      ? event.target.closest("a[href]")
      : null;
    if (!link) return;

    const explicitEvent = link.getAttribute("data-analytics-event");
    if (explicitEvent) {
      track(explicitEvent, {
        page,
        placement: inferPlacement(link),
        intent: getLinkIntent(link, browserWindow),
      });
      return;
    }

    if (isBriefingLink(link, browserWindow)) {
      track("briefing_cta_clicked", {
        page,
        placement: inferPlacement(link),
        intent: getLinkIntent(link, browserWindow),
      });
    }
  });

  const form = browserDocument.getElementById("digitrust-intake");
  if (form) {
    let intakeStarted = false;
    const recordStart = (event) => {
      const field = event.target;
      if (intakeStarted || !field || typeof field.matches !== "function") return;
      if (!field.matches("input:not([type='hidden']), select, textarea")) return;
      if (field.id === "website_check") return;
      intakeStarted = true;
      track("intake_started", { page, placement: "intake_form", intent: getPageIntent(browserWindow) });
    };

    form.addEventListener("focusin", recordStart);
    form.addEventListener("input", recordStart);
    form.addEventListener("submit", () => {
      const trap = browserDocument.getElementById("website_check");
      if ((trap && trap.value) || !form.checkValidity()) return;
      markSubmissionPending(browserWindow.sessionStorage);
    });
  }

  if (page.replace(/\/$/, "") === "/intake-thank-you" && consumeSubmissionPending(browserWindow.sessionStorage)) {
    track("lead_submitted", {
      page,
      placement: "formsubmit_redirect",
      intent: "none",
    });
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  setupConversionAnalytics(window, document);
}

export {
  EVENT_NAMES,
  SUBMISSION_PENDING_MAX_AGE_MS,
  consumeSubmissionPending,
  createTracker,
  inferPlacement,
  markSubmissionPending,
  measurementAllowed,
  normalizeEventPayload,
  normalizeIntent,
  normalizePath,
  normalizeSlug,
  setupConversionAnalytics,
};
