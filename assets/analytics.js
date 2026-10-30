import {
  SCHEMA_VERSION, SESSION_IDLE_MS, SESSION_MAX_MS, SESSION_ID,
  PATHS, PLACEMENTS, campaignCategories, category,
} from "./measurement-schema.js";

const EVENT_NAMES = Object.freeze([
  "session_started",
  "engaged_session",
  "assistant_directory_clicked",
  "trust_record_clicked",
  "briefing_cta_clicked",
  "intake_started",
]);

const EVENT_SET = new Set(EVENT_NAMES);
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
const EVENT_ENDPOINT = "/api/events";
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function normalizeSlug(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  return SAFE_SLUG.test(normalized) ? normalized : fallback;
}

function normalizePath(value) {
  try {
    let path = new URL(String(value || "/"), "https://analytics.invalid").pathname;
    if (path === "/get-started.html" || path === "/get-started/") path = "/get-started";
    return PATHS.includes(path) ? path : "/";
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
    placement: category(properties.placement, PLACEMENTS, "unknown"),
    intent: normalizeIntent(properties.intent),
    schema_version: SCHEMA_VERSION,
  };
}

function measurementAllowed(browserNavigator) {
  if (!browserNavigator) return true;
  return browserNavigator.globalPrivacyControl !== true && browserNavigator.doNotTrack !== "1"
    && browserNavigator.webdriver !== true;
}

const SESSION_KEY = "digitrust_measurement_session";
const EXCLUSION_KEY = "digitrust_measurement_excluded";

function internalTraffic(browserWindow) {
  try {
    const command = browserWindow.location?.hash;
    if (command === "#analytics=off" || command === "#analytics=on") {
      browserWindow.localStorage.setItem(EXCLUSION_KEY, command === "#analytics=off" ? "1" : "0");
      browserWindow.sessionStorage.removeItem(SESSION_KEY);
      browserWindow.history?.replaceState(null, "", browserWindow.location.pathname + browserWindow.location.search);
    }
    return browserWindow.localStorage.getItem(EXCLUSION_KEY) === "1";
  } catch {
    return browserWindow.location?.hash === "#analytics=off";
  }
}

function createTracker(runtime = {}) {
  const browserWindow = runtime.window || globalThis.window;
  const browserNavigator = runtime.navigator || browserWindow.navigator;
  const browserFetch = runtime.fetch || browserWindow.fetch;
  const browserBlob = runtime.Blob || browserWindow.Blob;

  const now = runtime.now || Date.now;
  const excluded = internalTraffic(browserWindow);

  function getSession() {
    if (excluded || !measurementAllowed(browserNavigator)) return null;
    try {
      const time = now();
      let session = JSON.parse(browserWindow.sessionStorage.getItem(SESSION_KEY) || "null");
      if (!session || !SESSION_ID.test(session.id) || !Number.isFinite(session.lastSeen)
          || !Number.isFinite(session.startedAt) || time < session.lastSeen
          || time - session.lastSeen >= SESSION_IDLE_MS || time - session.startedAt >= SESSION_MAX_MS) {
        const params = new URLSearchParams(browserWindow.location.search);
        const values = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign"].map((key) => [key, params.get(key) || ""]));
        session = { id: browserWindow.crypto.randomUUID(), startedAt: time, lastSeen: time,
          ...campaignCategories(values, runtime.document?.referrer || browserWindow.document?.referrer || "") };
      }
      session.lastSeen = time;
      browserWindow.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    } catch {
      // If session storage is blocked, do not inflate counts with a new ID per page.
      return null;
    }
  }

  function trackConversion(eventName, properties = {}) {
    const session = getSession();
    if (!session) return false;

    const payload = normalizeEventPayload(eventName, properties);
    if (!payload) return false;
    Object.assign(payload, { session_id: session.id, source: session.source, medium: session.medium, campaign: session.campaign });

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

    return queued;
  }
  trackConversion.session = getSession;
  trackConversion.scope = () => excluded ? "internal" : measurementAllowed(browserNavigator) ? "external" : "unmeasured";
  return trackConversion;
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

function setupConversionAnalytics(browserWindow = window, browserDocument = document) {
  const track = createTracker({ window: browserWindow, document: browserDocument });
  const page = normalizePath(browserWindow.location.pathname);
  const pageProperties = { page, placement: "page", intent: getPageIntent(browserWindow) };
  let started = false;
  const start = () => {
    if (!started && browserDocument.visibilityState !== "hidden") {
      started = true;
      track("session_started", pageProperties);
    }
  };
  start();
  browserDocument.addEventListener("visibilitychange", start);

  // Only foreground, focused viewing contributes. Background time does not count.
  let activeMs = 0;
  let lastTick = Date.now();
  function engage() {
    track("engaged_session", pageProperties);
  }
  const timer = browserWindow.setInterval(() => {
    const time = Date.now();
    if (browserDocument.visibilityState === "visible" && browserDocument.hasFocus()) {
      activeMs += Math.min(Math.max(time - lastTick, 0), 1500);
    }
    lastTick = time;
    if (activeMs >= 15000) { engage(); browserWindow.clearInterval(timer); }
  }, 1000);

  browserDocument.addEventListener("click", (event) => {
    if (event.isTrusted === false) return;
    const link = event.target && typeof event.target.closest === "function"
      ? event.target.closest("a[href]")
      : null;
    if (!link) return;

    const explicitEvent = link.getAttribute("data-analytics-event");
    if (explicitEvent) {
      if (!EVENT_SET.has(explicitEvent)) return;
      engage();
      track(explicitEvent, {
        page,
        placement: inferPlacement(link),
        intent: getLinkIntent(link, browserWindow),
      });
      return;
    }

    if (isBriefingLink(link, browserWindow)) {
      engage();
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
      if (event.isTrusted === false) return;
      const field = event.target;
      if (intakeStarted || !field || typeof field.matches !== "function") return;
      if (!field.matches("input:not([type='hidden']), select, textarea")) return;
      if (field.id === "website_check") return;
      intakeStarted = true;
      engage();
      track("intake_started", { page, placement: "intake_form", intent: getPageIntent(browserWindow) });
    };

    form.addEventListener("focusin", recordStart);
    form.addEventListener("input", recordStart);
    form.addEventListener("submit", () => {
      const session = track.session();
      const id = browserDocument.getElementById("measurement_session");
      const scope = browserDocument.getElementById("measurement_scope");
      if (id) id.value = session?.id || "";
      if (scope) scope.value = track.scope() === "internal" ? "internal" : session ? "external" : "unmeasured";
    });
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  setupConversionAnalytics(window, document);
}

export {
  EVENT_NAMES,
  createTracker,
  inferPlacement,
  measurementAllowed,
  normalizeEventPayload,
  normalizeIntent,
  normalizePath,
  normalizeSlug,
  setupConversionAnalytics,
  internalTraffic,
  SESSION_KEY,
  EXCLUSION_KEY,
};
