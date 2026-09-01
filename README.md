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

## Conversion measurement

The site records four allowlisted, aggregate funnel events through the same-origin `/api/events` Cloudflare Pages Function:

- `trust_record_clicked`
- `briefing_cta_clicked`
- `intake_started`
- `lead_submitted`

Event payloads contain only the event name, page path, categorical placement, categorical intent, and schema version. They never contain field values, email addresses, query strings, cookies, referrers, user-agent strings, IP addresses, or persistent visitor identifiers. Global Privacy Control and Do Not Track signals disable browser measurement.

The Function emits a privacy-safe structured log for each accepted event. For durable aggregate reporting, add the following Cloudflare Pages Analytics Engine bindings. Keeping preview data separate prevents synthetic verification events from polluting production conversion counts.

| Pages environment | Variable name | Dataset |
| --- | --- | --- |
| Production | `CONVERSION_EVENTS` | `digitrust_conversion_events` |
| Preview | `CONVERSION_EVENTS` | `digitrust_conversion_events_preview` |

In the Cloudflare dashboard, select the Pages project, choose the environment, then open **Settings > Bindings > Add > Analytics engine**. Save the binding and redeploy that environment for it to take effect. Configure bindings in the dashboard rather than adding a new Wrangler file, because the existing Pages project settings remain the deployment source of truth.

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

The optional Zaraz mirror activates automatically if Zaraz is later enabled in Cloudflare. Analytics failures never block navigation or intake submission.

Do not add secrets, customer data, deployment credentials, or private commercial terms to the repository.
