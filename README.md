# DigiTrans landing page

Static source for [digitranshq.com](https://www.digitranshq.com), deployed with Cloudflare Pages.

## Local preview

No build step is required. From the repository root:

```bash
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/`. The plain Python server does not reproduce Cloudflare Pages clean-URL redirects, so preview `get-started.html` locally when testing that source file.

## Deployment contract

- Cloudflare Pages publishes the repository root as a static site.
- Extensionless public URLs are canonical; for example, `/get-started`.
- `_headers` defines security headers applied by Cloudflare Pages.
- `vercel.json` remains as a compatibility configuration and must point to the same canonical URLs.
- Pull requests run HTML, claims, links, plain-language, commercial-detail, JavaScript, and local static smoke checks.

## Intake delivery

The onboarding and engagement form posts to the same-origin `/api/intake` Cloudflare Pages Function. Setup links use the `assisted-onboarding` intent; pilot links retain their distinct pilot intents. The Function validates an allowlisted URL-encoded payload, rejects oversized or cross-origin requests, handles the honeypot without sending mail, and sends a plain-text notification to the fixed `info@digitranshq.com` recipient through the Amazon SES v2 HTTPS API.

The recipient, sender, subject, SES service, and API path are fixed in source. AWS Signature Version 4 is generated with Web Crypto inside the Function; no AWS SDK or browser credential is used. Configure `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, and `AWS_SES_SECRET_ACCESS_KEY` in both the Preview and Production Pages environments under **Settings > Variables and Secrets**. Store both credential values as encrypted secrets. `AWS_SES_SESSION_TOKEN` is supported only when temporary credentials are intentionally used.

In the selected AWS Region, verify `notify.digitranshq.com` as an SES sending identity with Easy DKIM and add the generated CNAME records to Cloudflare DNS. If the SES account remains in the sandbox, also verify `info@digitranshq.com` as a recipient identity. The customer address is only the message's Reply-To address, so the fixed-recipient workflow can operate safely in the sandbox. Do not enable Cloudflare Email Routing or change the Microsoft 365 MX records.

Follow [`docs/aws-ses-intake-setup.md`](docs/aws-ses-intake-setup.md) for the exact DNS, least-privilege IAM, Pages-secret, verification, and credential-rotation procedure.

After changing the secret or email configuration, redeploy the relevant Pages environment. `GET /api/intake` is a non-writing health check and must report:

```json
{"status":"ok","delivery_provider":"aws_ses_v2","delivery_configured":true,"verification_configured":true,"turnstile_site_key":"<public sitekey>","schema_version":"2"}
```

Configure `TURNSTILE_SITE_KEY`, encrypted `TURNSTILE_SECRET`, and `TURNSTILE_HOSTNAMES` in each environment. Production accepts only `digitranshq.com,www.digitranshq.com`; preview uses a separate widget and `digitranshq.pages.dev,*.digitranshq.pages.dev`. The server requires a successful, single-use token with action `intake` and the exact request hostname.

The Function redirects to `/intake-thank-you/` only after Turnstile verification and SES acceptance of the fixed-recipient message with a message ID. Configuration, signing, and provider failures return the visitor to the form with a visible retry message. Submitted field values appear only in the SES delivery request and resulting DigiTrans mailbox message; the Function never logs or stores them.

## Visitor and conversion measurement

See [the measurement guide](docs/visitor-analytics.md) for definitions, configuration, internal exclusions, and campaign links.

Schema 2 measures short-lived browser sessions and engaged sessions, followed by the existing CTA, Assistant, sample-record and inquiry stages. Each browser stage counts at most once per session in a transactional D1 deduplication store. Session identifiers and hashes do not enter Analytics Engine. Schema-1 history remains available separately and must not be combined with the new session funnel.

Browser measurement honors GPC/DNT, suppresses webdriver and internally excluded browsers, and starts only on a visible page. The server also excludes EU countries and bot classifications when supplied by Cloudflare. The Free plan does not provide full Enterprise bot scoring. These are screened browser sessions, not verified unique people.

The existing Analytics Engine bindings remain:

| Environment | Binding | Dataset |
| --- | --- | --- |
| Production | `CONVERSION_EVENTS` | `digitrust_conversion_events` |
| Preview | `CONVERSION_EVENTS` | `digitrust_conversion_events_preview` |

Add a separate `MEASUREMENT_DB` D1 binding for each environment and apply [visitor-sessions.sql](docs/sql/visitor-sessions.sql). Configure bindings in the Cloudflare Pages dashboard/API; do not add Wrangler configuration that replaces the existing project settings. `GET /api/events` must report `status: ok`, `durable_storage: true`, `session_deduplication: true`, and `schema_version: "2"`.

| Analytics Engine column | Meaning |
| --- | --- |
| `blob1` | Event name |
| `blob2` | Approved page path |
| `blob3` | Fixed placement |
| `blob4` | Fixed intent |
| `blob5` | Schema version |
| `blob6`, `blob7`, `blob8` | Fixed source, medium, campaign categories |
| `blob9` | `external`, `internal`, or `unmeasured` |
| `double1` | Count (`1`) |

`lead_submitted` remains server-only and occurs only after Turnstile verification and SES acceptance. An accepted inquiry is not a qualified prospect. Its audience is `external` only when an active measured session is present; other inquiries appear separately as `unmeasured` or `internal`. Personal form fields and verification tokens never enter analytics.

### One-click Windows report

Double-click `Check-Analytics.bat` for a seven-day report, or run:

```powershell
.\Check-Analytics.bat -Days 30
.\Check-Analytics.bat -Environment Preview
.\Check-Analytics.bat -ForgetToken
```

The script uses a fixed aggregate query and only **Account > Account Analytics > Read** permission. Tokens stay encrypted with Windows DPAPI in `%LOCALAPPDATA%\DigiTrust`, outside the repository. No token is printed. The report separates schema-2 external sessions, unmeasured inquiries, internal traffic and legacy events. Sample-adjusted counts remain estimates; it does not calculate conversion rates across incompatible cohorts or count unique people. Qualification remains in the sales process.

`Check-Preview-Analytics.bat` checks only the preview dataset. Analytics Engine is the aggregate sink; write failures can undercount, and D1 deduplication does not make the two services an atomic transaction. Measurement failures do not block browsing or inquiry delivery. The optional browser Zaraz mirror has been removed so it cannot bypass server-side exclusions or deduplication.

Do not add secrets, customer data, deployment credentials, or private commercial terms to the repository.
