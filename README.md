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

Do not add secrets, customer data, deployment credentials, or private commercial terms to the repository.
