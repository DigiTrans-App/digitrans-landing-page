import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const siteScript = readFileSync(new URL("../assets/site.js", import.meta.url), "utf8");
const intakeHtml = readFileSync(new URL("../get-started.html", import.meta.url), "utf8");
const defaultIntent = intakeHtml.match(/name="intent"[^>]*value="([^"]+)"/)[1];

test("the customer journey carries the selected request type into the intake form", () => {
  for (const [search, storedIntent, expected] of [
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
