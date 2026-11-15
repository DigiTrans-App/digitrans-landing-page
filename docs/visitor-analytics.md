# Visitor measurement, schema 2

This report estimates interest in DigiTrust. It does not identify anonymous people, prove that every visit is human, or automatically qualify prospects.

## Definitions

| Metric | Definition |
| --- | --- |
| Screened browser sessions | Random session in browser session storage; starts on a visible page or recorded interaction. New session after 30 minutes without a recorded event, 24 hours maximum, or a new tab/session-storage context. |
| Engaged sessions | At least 15 seconds of visible, focused viewing on a page, or a trusted CTA/form interaction. A heuristic for interest, not proof of a human. |
| CTA / Assistant / sample-record / form-start stages | Each named stage counts once per session. Placement and page describe the first occurrence, not total clicks. |
| Accepted inquiries | Turnstile passed and SES accepted the notification. Counts submissions, not distinct people or session conversions. |
| Qualified prospects | Established by reviewing the inquiry in the sales process. Not inferred from website activity. |

Counts in Analytics Engine can be sampled. Its writes are best-effort after D1 deduplication; a sink failure can undercount. A new browser tab, cleared storage, different browser or device can create another session. Sophisticated bots can run JavaScript or forge event requests, and genuine visitors can decline measurement or block scripts. Do not call these exact unique visitors or compute a conversion rate by mixing them with Cloudflare RUM's differently defined visits.

## Internal exclusion

John, Miriah and anyone testing the production website should open this once in **each browser and on each hostname they use**:

`https://www.digitranshq.com/#analytics=off`

It stores a non-identifying exclusion preference, clears the measurement session, and removes the command from the address bar. Internal page events are suppressed; accepted inquiries are labeled `internal` and excluded from the external funnel. Restore measurement with `#analytics=on`. If browser storage is unavailable, the preference cannot persist; browser session measurement is suppressed when session storage cannot be used.

This opt-out controls our schema-2 funnel, not the separately injected Cloudflare RUM beacon. Preview uses separate datasets and D1 storage. Never post synthetic production events to test counting.

## Campaign links for outreach

Use campaign names from the fixed list: `aws-cosell`, `readiness-review`, `healthcare`, `financial-services`, `evidence-assistant`, `general`.

Examples:

- AWS seller referral: `https://www.digitranshq.com/?utm_source=aws&utm_medium=referral&utm_campaign=aws-cosell`
- Miriah's readiness email: `https://www.digitranshq.com/?utm_source=email&utm_medium=email&utm_campaign=readiness-review`
- LinkedIn outreach: `https://www.digitranshq.com/?utm_source=linkedin&utm_medium=social&utm_campaign=general`

Keep names, emails, customer/account identifiers and recipient-specific IDs out of tracking links. Unknown values become `other` in aggregate events. First-session campaign categories remain fixed as the visitor navigates; the existing intake attribution fields may reflect later campaign parameters and are kept only with the inquiry. Empty referrers mean `direct_or_unknown`, not proof of a typed URL. Historical unknown sources cannot be recovered.

## Cloudflare configuration

Use the existing `digitranshq` Pages project, with dashboard/API-managed settings. Preserve SES secrets, Analytics Engine bindings and all other project settings.

1. Create separate D1 databases `digitrust-visitor-sessions` and `digitrust-visitor-sessions-preview`; apply [the schema](sql/visitor-sessions.sql) to each and bind as `MEASUREMENT_DB` in the corresponding environment.
2. Create separate Managed Turnstile widgets for production and preview, with no pre-clearance cookie. Production widget domains: `digitranshq.com`, `localhost`, `127.0.0.1`; preview: `digitranshq.pages.dev`, `localhost`, `127.0.0.1`. The production backend still rejects local hostnames.
3. Set `TURNSTILE_SITE_KEY` (public), encrypted `TURNSTILE_SECRET`, and `TURNSTILE_HOSTNAMES`. Production hostnames: `digitranshq.com,www.digitranshq.com`; preview: `digitranshq.pages.dev,*.digitranshq.pages.dev`. Never put a real secret in the repository or command output.
4. Deploy preview. Check `/api/events` and `/api/intake` health. All configuration flags must be true; neither GET sends email or records a visitor event.
5. Run unit/SQLite integration tests, all existing site checks, and GitHub CI. Exercise the real preview widget, verify a fresh token, and verify replay rejection. Validate SES separately using its existing procedure only when a controlled email submission is authorized.
6. Merge the reviewed change, verify the production deployment SHA and read-only health. Public message copy stays the same, apart from form verification help and the updated privacy notice.

The frontend fetches its public sitekey from `/api/intake`; secrets stay in Pages. Tokens are checked server-side for `success === true`, action `intake`, and the exact request hostname within the environment allowlist. Failed, missing, expired, replayed or wrong-host/action tokens never reach SES. Turnstile failure shows a retry/email alternative.

## Retention and coverage

The D1 store contains a hash of the random session ID, timestamps, fixed campaign categories and stage names. No IPs, user agents, inquiry fields, arbitrary URLs or names are stored there. Active lookup stops after 30 minutes idle / 24 hours maximum. Records older than 24 hours are deleted on the next accepted measurement request; provider recovery backups can retain prior states longer. Analytics Engine retains only aggregates without these IDs or hashes.

GPC and DNT disable browser measurement and are also checked at the endpoint when sent as request headers. Browser webdriver and Cloudflare's bot signals, when available, are excluded; the Free plan does not provide Enterprise bot scoring. EU requests are excluded using Cloudflare's supplied country, preserving the existing RUM exclusion. Inquiries can still be delivered and counted separately as `unmeasured`. Internal exclusions are labels, not authentication or a security boundary.

## Reporting and rollback

Run `Check-Analytics.bat -Days 30`. Read schema-2 external counts as the new funnel; keep legacy schema-1 totals and unmeasured/internal inquiries separate. New measurement begins at deployment, with no historical backfill. An inquiry without a measured session can be genuine and should still receive follow-up. Review qualified status in the sales process.

## Readiness-check offer and ChatGPT inquiries

The homepage's primary offer leads to `/readiness-check/`: a complimentary initial review of one or two AI workflows and a short written summary of evidence gaps, review responsibilities, and recommended next steps. Paid implementation, expanded assessment, and software are scoped separately. The form fixes its request type to `readiness-check`, even if a visitor previously explored another engagement.

The current ad keeps its destination and budget. Its link uses the fixed categories `utm_source=chatgpt`, `utm_medium=paid`, and `utm_campaign=digitrust_evidence_assurance`. Same-origin campaign links carry these parameters to the offer. Session attribution keeps the first measured source; raw attribution remains only with the inquiry email. These tags identify the campaign link, not independently verified ad delivery.

The report adds a ChatGPT ad readiness section. Read each row separately:

| Event | Meaning |
| --- | --- |
| `session_started` | A screened session tagged with the current ChatGPT ad campaign, anywhere on the site. |
| `readiness_cta_clicked` | A trusted click on a link to the readiness offer or its form; once per session. |
| `readiness_check_viewed` | The readiness page became visible; once per session, including a direct visit. |
| `readiness_intake_started` | A trusted interaction with a real form field on the readiness page; once per session. |
| `lead_submitted`, intent `readiness-check` | Server-side spam verification passed and SES accepted the inquiry notification. Submission count, not a count of unique people, bookings, or qualified prospects. |

Dedicated readiness stages are separate from generic site stages so an earlier visit to the general intake does not hide later interest in this offer. They must not be summed with their generic counterparts. Reloading a thank-you page never records an accepted inquiry. Failures remain on the appropriate intake page and record no accepted inquiry. Unmeasured/internal submissions remain separate in the detailed table; an inquiry can still be valid without browser measurement.

Readiness requests arrive at the existing business inbox with subject `New DigiTrust Readiness Check Request`. Use the submission ID to reconcile an inquiry privately. Record qualification, a scheduled conversation, and any paid engagement in the existing private sales record after human follow-up. Do not put prospect names, emails, workflow descriptions, or these sales outcomes into browser events or public reports.

For the US$50 test, compare Ads Manager's actual spend and clicks with these first-party inquiry counts over the same reporting dates. Cost per accepted inquiry is spend divided by campaign-attributed accepted inquiries; if there are none, report it as unavailable. Do not call it cost per qualified lead. Allow for reporting delay, sampling, blocked measurement, and differing session/click definitions. Older `other` categories cannot be reconstructed, and no native Ads Manager conversion source/event is configured by this change.

Validation uses local simulated Turnstile and SES responses plus the isolated preview. Production verification uses GET health checks and opt-out browsing, not synthetic lead submissions. A live mailbox receipt and real visitor attribution require a genuine or explicitly authorized test inquiry.

If rollback is needed, revert the PR and redeploy the prior application commit. Retain the new bindings and secrets until the rollback is verified; the old application ignores them. Do not delete datasets or rewrite historical events. The full pre-update Pages configuration should be compared by non-secret metadata, never by exposing encrypted values.
