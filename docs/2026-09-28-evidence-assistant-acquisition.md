# Evidence Assistant customer path

This change adds the verified direct directory link to the homepage and existing news page,
and a focused `/evidence-assistant/` guide. It describes the currently published 2.0.1
synthetic experience accurately. It does not claim the proposed 2.1.0 submitted-evidence
review is live, or promise that every customer workspace permits the plugin.

The Assistant privacy policy discloses the separately enabled, bounded processing of
selected non-sensitive claims and excerpts before that tool is enabled. The backend
release remains gated by its explicit runtime switch. Publishing the policy does not
publish or enable the tool.

## First customer path

1. Open the directory entry using the guide; install/connect if available.
2. Select the Assistant and run the guide's synthetic vendor-review prompt.
3. Inspect claim links, gaps, limitations and the human-review boundary.
4. For a separate DigiTrust service conversation, use the website's assisted onboarding
   request. Scope, subscription, workspace access and accepted data protections are handled
   through the established assisted process.

No subscription pitch, checkout or lead-capture tool is added inside the plugin.

## Measurement and first acquisition experiment

- `assistant_directory_clicked` counts outbound website clicks only. It does not establish
  an install, successful review, customer identity or conversion in ChatGPT.
- `assistant-onboarding` preserves the source category through the existing intake and
  fixed-recipient notification; server-side `lead_submitted` means SES accepted delivery.
- Browser events retain the existing narrow schema and honor GPC/DNT. They contain no
  conversation, evidence, form contents, cookies or persistent visitor identifiers.
- Use voluntary feedback during assisted sessions to record completed first reviews and
  repeat use. Do not derive identities or marketing leads from plugin requests.
- In the existing sales process, record qualified requests, proposals and signed customers
  separately. Directory clicks and lead counts alone are not a reliable end-to-end
  conversion rate because no cross-product identity matching is performed.

Initial experiment: 10 relevant security/procurement prospects with an active vendor review,
5 assisted first-use sessions, 2 scoped proposals and 1 paid engagement. These are planning
targets, not existing customers or promised outcomes. No outreach is sent by this change.

## Publication acceptance

Run the Node suite and existing site validation. Check desktop/mobile layout on the Pages
preview, the direct directory destination, the current-version note, privacy disclosure,
and onboarding category without submitting a real intake. Health checks must show durable
analytics storage and configured intake delivery. An independent customer's install and
name search remain a separate observation; use their own authorized account and record
the supported surface and workspace policy. Do not bypass administrator restrictions.

After the new plugin version is approved, published and verified, update the guide's
version note and first-use prompt to the submitted-evidence task. Until then, keep the
synthetic starter workflow.
