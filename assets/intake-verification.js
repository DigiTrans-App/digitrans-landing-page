// Turnstile gates the existing native form; verification happens on the server.
export async function setupIntakeVerification(win = window, doc = document) {
  const form = doc.getElementById("digitrust-intake");
  const container = doc.getElementById("intake-verification");
  if (!form || !container) return;
  const button = form.querySelector("button[type='submit']");
  const status = doc.getElementById("intake-status");
  let widgetId;
  let ready = false;
  const setReady = (value) => {
    ready = value;
    button.disabled = !value;
    button.textContent = value ? "Send request" : "Complete verification";
  };
  const showFailure = () => {
    setReady(false);
    status.textContent = "Verification could not finish. Please reload this page or email info@digitranshq.com.";
    status.hidden = false;
  };
  setReady(false);
  form.addEventListener("submit", (event) => {
    if (!ready || !win.turnstile?.getResponse(widgetId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showFailure();
    }
  }, true);
  win.addEventListener("pageshow", (event) => {
    if (event.persisted && widgetId !== undefined) {
      setReady(false);
      win.turnstile.reset(widgetId);
    }
  });
  try {
    const response = await win.fetch("/api/intake", { credentials: "omit", cache: "no-store" });
    const config = await response.json();
    if (!response.ok || !config.verification_configured || !config.turnstile_site_key) throw new Error("unavailable");
    const render = () => {
      widgetId = win.turnstile.render(container, {
        sitekey: config.turnstile_site_key,
        action: "intake",
        size: "flexible",
        callback: () => setReady(true),
        "expired-callback": () => setReady(false),
        "error-callback": showFailure,
        "timeout-callback": () => setReady(false),
      });
    };
    if (win.turnstile) render();
    else {
      win.digitrustTurnstileReady = render;
      const script = doc.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=digitrustTurnstileReady&render=explicit";
      script.async = true;
      script.onerror = showFailure;
      doc.head.appendChild(script);
    }
  } catch { showFailure(); }
}

if (typeof window !== "undefined" && typeof document !== "undefined") setupIntakeVerification();
