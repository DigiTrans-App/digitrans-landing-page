// Optional OpenAI Ads measurement. No SDK or ad event loads before consent.
const PIXEL_ID = "WLmDmui7WhvhS8rnX2p2he";
const CONSENT_KEY = "digitrust_ad_measurement_consent";
const RECEIPT_COOKIE = "__Host-digitrust_readiness_conversion";
const RECEIPT_MAX_AGE_MS = 120000;

function browserAllowed(win) {
  try {
    return ["www.digitranshq.com", "digitranshq.com"].includes(win.location.hostname)
      && win.navigator.globalPrivacyControl !== true && win.navigator.doNotTrack !== "1"
      && win.navigator.webdriver !== true && win.location.hash !== "#analytics=off"
      && win.localStorage.getItem("digitrust_measurement_excluded") !== "1";
  } catch { return false; }
}

function hasConsent(win) {
  try { return win.sessionStorage.getItem(CONSENT_KEY) === "granted"; }
  catch { return false; }
}

function clearCookie(doc, name) {
  doc.cookie = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
  if (!name.startsWith("__Host-")) {
    for (const domain of ["digitranshq.com", "www.digitranshq.com"]) {
      doc.cookie = `${name}=; Domain=${domain}; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    }
  }
}

function readReceipt(doc, now) {
  const value = doc.cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${RECEIPT_COOKIE}=`))?.slice(RECEIPT_COOKIE.length + 1);
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(\d{13})$/.exec(value || "");
  if (!match || now < Number(match[2]) || now - Number(match[2]) > RECEIPT_MAX_AGE_MS) return null;
  return match[1];
}

function setupAdConversions(win = window, doc = document, now = Date.now) {
  const choice = doc.getElementById("ad_measurement_consent");
  const optOut = doc.getElementById("ad-measurement-opt-out");
  const status = doc.getElementById("ad-measurement-status");
  let initializing;

  function revoke() {
    initializing = undefined;
    try { win.sessionStorage.removeItem(CONSENT_KEY); } catch { /* Optional storage. */ }
    if (choice) choice.checked = false;
    if (typeof win.oaiq === "function") win.oaiq("consent", false);
    for (const name of [RECEIPT_COOKIE, "__oppref", "__obref"]) clearCookie(doc, name);
    if (status) status.textContent = "Ad measurement is off for this tab.";
  }

  async function initialize() {
    if (!browserAllowed(win) || !hasConsent(win)) return false;
    if (!initializing) initializing = (async () => {
      try {
        // Keep the existing server-side regional and bot exclusions.
        const response = await win.fetch("/api/intake", { credentials: "omit", cache: "no-store" });
        const config = await response.json();
        if (!response.ok || config.ad_measurement_allowed !== true || !browserAllowed(win) || !hasConsent(win)) return false;
        if (!win.oaiq) {
          const q = function () { q.q.push(arguments); };
          q.q = [];
          win.oaiq = q;
          q("consent", true);
          q("init", { pixelId: PIXEL_ID });
          const script = doc.createElement("script");
          script.async = true;
          script.src = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
          doc.head.appendChild(script);
        } else win.oaiq("consent", true);
        return true;
      } catch { return false; } // Measurement never blocks the inquiry.
    })();
    const ready = await initializing;
    if (!ready) initializing = undefined;
    return ready && browserAllowed(win) && hasConsent(win);
  }

  if (choice) {
    choice.checked = browserAllowed(win) && hasConsent(win);
    choice.disabled = !browserAllowed(win);
    choice.addEventListener("change", () => {
      if (!choice.checked || !browserAllowed(win)) { revoke(); return; }
      try { win.sessionStorage.setItem(CONSENT_KEY, "granted"); }
      catch { choice.checked = false; return; }
      if (status) status.textContent = "Ad measurement is on for this tab.";
      void initialize();
    });
    if (choice.checked) void initialize();
  }
  optOut?.addEventListener("click", revoke);
  win.addEventListener?.("hashchange", () => { if (!browserAllowed(win)) revoke(); });

  async function reportAcceptedRequest() {
    if (win.location.pathname !== "/intake-thank-you/") return false;
    const eventId = readReceipt(doc, now());
    clearCookie(doc, RECEIPT_COOKIE); // A reload or direct page visit is not a new lead.
    if (!eventId || !await initialize()) return false;
    win.oaiq("measure", "lead_created", { type: "customer_action" }, { event_id: eventId, opt_out: true });
    return true;
  }

  const result = reportAcceptedRequest();
  return { result, revoke };
}

if (typeof window !== "undefined" && typeof document !== "undefined") setupAdConversions();

export { PIXEL_ID, CONSENT_KEY, RECEIPT_COOKIE, browserAllowed, readReceipt, setupAdConversions };
