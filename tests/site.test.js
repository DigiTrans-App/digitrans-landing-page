import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const siteScript = readFileSync(new URL("../assets/site.js", import.meta.url), "utf8");
const intakeHtml = readFileSync(new URL("../get-started.html", import.meta.url), "utf8");
const defaultIntent = intakeHtml.match(/name="intent"[^>]*value="([^"]+)"/)[1];

test("the customer journey carries the selected request type into the intake form", () => {
  for (const [search, storedIntent, expected] of [
    ["?intent=assistant-onboarding", "enterprise-pilot", "assistant-onboarding"],
    ["?intent=assisted-onboarding", "enterprise-pilot", "assisted-onboarding"],
    ["?intent=enterprise-pilot", "assisted-onboarding", "enterprise-pilot"],
    ["", undefined, "engagement-guidance"],
  ]) {
    const field = { value: defaultIntent };
    const links = ["assisted-onboarding", "enterprise-pilot"].map((intent) => ({
      href: `/get-started?intent=${intent}#intake`,
      getAttribute() { return this.href; },
      setAttribute(_name, value) { this.href = value; },
    }));
    const location = new URL(`https://www.digitranshq.com/get-started${search}`);
    runInNewContext(siteScript, {
      URL, URLSearchParams,
      window: {
        location,
        sessionStorage: {
          getItem: () => JSON.stringify({ intent: storedIntent }),
          setItem: () => {},
        },
      },
      document: {
        querySelector: () => null,
        querySelectorAll: (selector) => selector === "[data-campaign-link]" ? links : [],
        getElementById: (id) => id === "intent" ? field : null,
      },
    });
    assert.equal(field.value, expected);
    assert.deepEqual(links.map(({ href }) => href), [
      "/get-started?intent=assisted-onboarding#intake",
      "/get-started?intent=enterprise-pilot#intake",
    ]);
  }
});

test("ChatGPT campaign survives the homepage-to-offer journey while the offer keeps its own intent", () => {
  const stored = new Map([["digitrust_campaign", JSON.stringify({ intent: "enterprise-pilot" })]]);
  const sessionStorage = { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
  const link = { href: "/readiness-check/", getAttribute() { return this.href; }, setAttribute(_name, value) { this.href = value; } };
  const run = (url, fields, links = []) => runInNewContext(siteScript, {
    URL, URLSearchParams, window: { location: new URL(url), sessionStorage },
    document: {
      referrer: "https://www.digitranshq.com/",
      querySelector: () => null,
      querySelectorAll: (selector) => selector === "[data-campaign-link]" ? links : [],
      getElementById: (id) => fields[id] || null,
    },
  });
  run("https://www.digitranshq.com/?utm_source=chatgpt&utm_medium=paid&utm_campaign=digitrust_evidence_assurance", {}, [link]);
  const destination = new URL(link.href, "https://www.digitranshq.com");
  assert.equal(destination.searchParams.get("utm_source"), "chatgpt");
  assert.equal(destination.searchParams.get("utm_medium"), "paid");
  assert.equal(destination.searchParams.get("utm_campaign"), "digitrust_evidence_assurance");
  const fields = Object.fromEntries(["intent", "utm_source", "utm_medium", "utm_campaign", "source_path"].map((key) => [key, { value: "" }]));
  fields.intent = { value: "readiness-check", getAttribute: (name) => name === "data-fixed-intent" ? "true" : null };
  destination.searchParams.set("intent", "enterprise-pilot");
  run(destination.href, fields);
  assert.equal(fields.intent.value, "readiness-check");
  assert.equal(fields.utm_source.value, "chatgpt");
  assert.equal(fields.utm_medium.value, "paid");
  assert.equal(fields.utm_campaign.value, "digitrust_evidence_assurance");
  assert.equal(fields.source_path.value, "/readiness-check/");
});

test("readiness offer keeps the verified intake contract and makes its scope clear", () => {
  const html = readFileSync(new URL("../readiness-check/index.html", import.meta.url), "utf8");
  assert.match(html, /action="\/api\/intake" method="POST"/);
  assert.match(html, /name="intent"[^>]+value="readiness-check"[^>]+data-fixed-intent="true"/);
  assert.match(html, /id="intake-verification"/);
  assert.match(html, /src="\/assets\/intake-verification.js"/);
  assert.match(html, /complimentary initial review of one or two workflows/i);
  assert.match(html, /short summary of evidence gaps/);
  assert.match(html, /scoped and priced separately before work begins/);
  const requiredFields = [...html.matchAll(/<(?:input|select)[^>]+\brequired\b[^>]*>/g)].map(([tag]) => tag.match(/name="([^"]+)"/)[1]);
  assert.deepEqual(requiredFields.sort(), ["company", "consent", "email", "full_name", "workflow_type"]);
});
