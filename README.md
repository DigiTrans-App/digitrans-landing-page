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

The enterprise-pilot form posts to the same-origin `/api/intake` Cloudflare Pages Function. The Function validates an allowlisted URL-encoded payload, rejects oversized or cross-origin requests, handles the honeypot without sending mail, and sends a plain-text notification to the fixed `info@digitranshq.com` recipient through the Cloudflare Email Service REST API.

The recipient, sender, Cloudflare account, subject, and API endpoint are fixed in source. The only required runtime secret is `INTAKE_EMAIL_TOKEN`. Create a Cloudflare API token scoped to the DigiTrans account with only permission to send email, then add it to both the Preview and Production Pages environments under **Settings > Variables and Secrets** as an encrypted secret. Never expose it as a client-side variable or commit it to the repository.

Before adding the secret, onboard and verify the `notify.digitranshq.com` sending subdomain in Cloudflare Email Service so `forms@notify.digitranshq.com` is an authorized sender. Verify `info@digitranshq.com` as the fixed destination. Using the dedicated sending subdomain keeps the existing Microsoft 365 mail routing for `digitranshq.com` separate.

After changing the secret or email configuration, redeploy the relevant Pages environment. `GET /api/intake` is a non-writing health check and must report:

```json
{"status":"ok","delivery_provider":"cloudflare_email_service","delivery_configured":true,"schema_version":"1"}
```

The Function redirects to `/intake-thank-you/` only after Cloudflare reports the fixed recipient as delivered or queued without a permanent bounce. Configuration and provider failures return the visitor to the form with a visible retry message. Submitted field values appear only in the delivery request and resulting DigiTrans mailbox message; the Function never logs or stores them.

## Conversion measurement

The site records four allowlisted, aggregate funnel events. Browser interactions use the same-origin `/api/events` Cloudflare Pages Function, while the intake Function records the final delivery event directly:

- `trust_record_clicked`
- `briefing_cta_clicked`
- `intake_started`
- `lead_submitted`

Browser event payloads contain only the event name, page path, categorical placement, categorical intent, and schema version. They never contain field values, email addresses, query strings, cookies, referrers, user-agent strings, IP addresses, or persistent visitor identifiers. Global Privacy Control and Do Not Track signals disable browser measurement.

`lead_submitted` is not accepted from browser analytics. The intake Function records it directly only after the Cloudflare Email Service accepts the notification for delivery. This keeps the lead count tied to successful backend acceptance without exposing inquiry contents to analytics.

The Function emits a privacy-safe structured log for each accepted event. For durable aggregate reporting, add the following Cloudflare Pages Analytics Engine bindings. Keeping preview data separate prevents synthetic verification events from polluting production conversion counts.

| Pages environment | Variable name | Dataset |
| --- | --- | --- |
| Production | `CONVERSION_EVENTS` | `digitrust_conversion_events` |
| Preview | `CONVERSION_EVENTS` | `digitrust_conversion_events_preview` |

In the Cloudflare dashboard, select the Pages project, choose the environment, then open **Settings > Bindings > Add > Analytics engine**. Save the binding and redeploy that environment for it to take effect. Configure bindings in the dashboard rather than adding a new Wrangler file, because the existing Pages project settings remain the deployment source of truth.

After deployment, `GET /api/events` returns a non-writing health response. Confirm that it reports `"durable_storage": true` before merging or promoting a deployment. The response exposes no event counts or customer information.

The Analytics Engine columns are fixed:

| Column | Meaning |
| --- | --- |
| `blob1` | Event name |
| `blob2` | Page path |
| `blob3` | Placement |
| `blob4` | Intent |
| `blob5` | Schema version |
| `double1` | Event count (`1`) |

Example seven-day aggregate query:

```sql
SELECT
  blob1 AS event_name,
  blob2 AS page_path,
  blob3 AS placement,
  SUM(_sample_interval * double1) AS events
FROM digitrust_conversion_events
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY event_name, page_path, placement
ORDER BY events DESC
```

### One-click Windows report

Windows operators can double-click `Check-Analytics.bat` to check the production endpoint and display a seven-day aggregate conversion report. On the first run, the launcher opens Cloudflare's API Token page and requests a custom token with only **Account > Account Analytics > Read** permission. The token is verified before it is saved, encrypted with Windows Data Protection API for the current Windows user, and stored under `%LOCALAPPDATA%\DigiTrust` rather than in the repository.

Later runs require no SQL, dashboard navigation, or token entry. Optional command-line controls are:

```powershell
.\Check-Analytics.bat -Days 30
.\Check-Analytics.bat -ForgetToken
```

The report uses a fixed production dataset and aggregate query. It does not accept arbitrary SQL, print the API token, write results to disk, or expose analytics through a public endpoint.

The optional Zaraz mirror activates automatically if Zaraz is later enabled in Cloudflare. Analytics failures never block navigation or intake submission.

Do not add secrets, customer data, deployment credentials, or private commercial terms to the repository.
