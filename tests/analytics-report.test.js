import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("../scripts/check-analytics.ps1", import.meta.url);
const launcherUrl = new URL("../Check-Analytics.bat", import.meta.url);
const previewLauncherUrl = new URL("../Check-Preview-Analytics.bat", import.meta.url);

test("one-click analytics reporter keeps dataset selection allowlisted and aggregate", async () => {
  const script = await readFile(scriptUrl, "utf8");
  const publicParameters = script.slice(0, script.indexOf("Set-StrictMode"));

  assert.match(publicParameters, /\[ValidateSet\("Production", "Preview"\)\]/);
  assert.match(script, /Production = "digitrust_conversion_events"/);
  assert.match(script, /Preview = "digitrust_conversion_events_preview"/);
  assert.match(script, /SUM\(_sample_interval \* double1\)/);
  assert.match(script, /\[ValidateRange\(1, 90\)\]/);
  assert.doesNotMatch(publicParameters, /\$Query\b/i);
  assert.doesNotMatch(publicParameters, /\$Dataset\b/i);
});

test("preview analytics mode verifies only the server-side SES lead event", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /\$Environment -eq "Preview"/);
  assert.match(script, /\$_.event_name -eq "lead_submitted"/);
  assert.match(script, /\$_.page_path -eq "\/intake-thank-you\/"/);
  assert.match(script, /\$_.placement -eq "aws_ses_intake"/);
  assert.match(script, /Preview SES lead verification event: found/);
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

test("preview launcher fixes the environment without accepting command-line overrides", async () => {
  const launcher = await readFile(previewLauncherUrl, "utf8");

  assert.match(launcher, /check-analytics\.ps1" -Environment Preview/i);
  assert.doesNotMatch(launcher, /%\*/);
  assert.match(launcher, /exit \/b %report_exit_code%/i);
});
