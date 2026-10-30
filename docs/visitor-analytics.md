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

If rollback is needed, revert the PR and redeploy the prior application commit. Retain the new bindings and secrets until the rollback is verified; the old application ignores them. Do not delete datasets or rewrite historical events. The full pre-update Pages configuration should be compared by non-secret metadata, never by exposing encrypted values.
