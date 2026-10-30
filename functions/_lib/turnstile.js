export function turnstileConfigured(env = {}) {
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && env.TURNSTILE_HOSTNAMES);
}

export async function verifyTurnstile(token, request, env, fetchImpl = fetch) {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048 || !turnstileConfigured(env)) return false;
  const host = new URL(request.url).hostname;
  const allowed = env.TURNSTILE_HOSTNAMES.split(",").map((value) => value.trim());
  const matchesHost = allowed.some((value) => value === host || (value === "*.digitranshq.pages.dev" && host.endsWith(".digitranshq.pages.dev")));
  if (!matchesHost) return false;
  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && result.action === "intake" && result.hostname === host;
  } catch { return false; }
}
