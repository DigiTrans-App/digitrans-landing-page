import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("../scripts/check-analytics.ps1", import.meta.url);
const launcherUrl = new URL("../Check-Analytics.bat", import.meta.url);

test("one-click analytics reporter keeps its production query fixed and aggregate", async () => {
  const script = await readFile(scriptUrl, "utf8");
  const publicParameters = script.slice(0, script.indexOf("Set-StrictMode"));

  assert.match(script, /\$Dataset = "digitrust_conversion_events"/);
  assert.match(script, /SUM\(_sample_interval \* double1\)/);
  assert.match(script, /\[ValidateRange\(1, 90\)\]/);
  assert.doesNotMatch(publicParameters, /\$Query\b/i);
});

test("one-click analytics reporter protects and never prints the Cloudflare token", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /Read-Host "Paste the new read-only token here" -AsSecureString/);
  assert.match(script, /ConvertFrom-SecureString -SecureString \$SecureToken/);
  assert.match(script, /ConvertTo-SecureString -String \$encryptedToken/);
  assert.doesNotMatch(script, /Write-(Host|Output)[^\n]*\$token\b/i);
  assert.doesNotMatch(script, /ConvertTo-Json[\s\S]*Authorization/i);
});

test("Windows launcher invokes only the repository analytics script", async () => {
  const launcher = await readFile(launcherUrl, "utf8");

  assert.match(launcher, /powershell\.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\check-analytics\.ps1" %\*/i);
  assert.match(launcher, /exit \/b %report_exit_code%/i);
});
