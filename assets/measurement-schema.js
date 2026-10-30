// Shared, fixed categories. Never put recipient names, emails, or arbitrary URLs here.
export const SCHEMA_VERSION = "2";
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const SOURCES = ["direct_or_unknown", "linkedin", "aws", "google", "bing", "email", "partner", "other"];
export const MEDIUMS = ["unknown", "social", "email", "referral", "organic", "other"];
export const CAMPAIGNS = ["none", "aws-cosell", "readiness-review", "healthcare", "financial-services", "evidence-assistant", "general", "other"];
export const PLACEMENTS = ["unknown", "page", "navigation", "hero", "pilot_summary", "pilot", "closing", "marketplace", "industry", "assistant_guide", "synthetic_demo", "assistant_news", "content", "homepage_assistant", "decision_review", "intake_form", "aws_ses_intake"];
export const PATHS = ["/", "/get-started", "/pricing/", "/healthcare/", "/financial-services/", "/aws-marketplace/", "/reference-architecture/", "/evidence-assistant/", "/privacy/", "/privacy/digitrust-evidence-assistant/", "/terms/", "/intake-thank-you/", "/thank-you/", "/news/aws-validated-software-path/", "/news/digitrust-evidence-assistant-chatgpt/"];

export function category(value, allowed, fallback) {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  return allowed.includes(normalized) ? normalized : fallback;
}

export function campaignCategories(values = {}, referrer = "") {
  const aliases = { "aws-seller": "aws", "aws-cosell": "aws", "amazon": "aws" };
  const rawSource = (values.utm_source || "").toLowerCase().trim();
  let source = category(aliases[rawSource] || rawSource, SOURCES, rawSource ? "other" : "direct_or_unknown");
  let medium = category(values.utm_medium, MEDIUMS, values.utm_medium ? "other" : "unknown");
  if (!rawSource && referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      const isHost = (domain) => host === domain || host.endsWith(`.${domain}`);
      if (isHost("linkedin.com")) { source = "linkedin"; medium = "social"; }
      else if (isHost("google.com")) { source = "google"; medium = "organic"; }
      else if (isHost("bing.com")) { source = "bing"; medium = "organic"; }
      else if (isHost("aws.amazon.com")) { source = "aws"; medium = "referral"; }
      else if (!isHost("digitranshq.com") && !isHost("digitranshq.pages.dev")) { source = "other"; medium = "referral"; }
    } catch { /* Keep the unknown category. */ }
  }
  return { source, medium, campaign: category(values.utm_campaign, CAMPAIGNS, values.utm_campaign ? "other" : "none") };
}
