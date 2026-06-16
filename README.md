# DigiTrans PrivacyIQ Landing Page

Static landing page package for **DigiTrans PrivacyIQ**, ready for GitHub and Cloudflare Pages.

Contact email included in the page: `info@digitranshq.com`

## Package contents

```text
.
├── index.html
├── styles.css
├── script.js
├── _headers
├── _redirects
├── wrangler.toml
├── package.json
├── assets/
│   └── digitrans-logo.png
└── README.md
```

## Deploy to GitHub

1. Create a new GitHub repository.
2. Upload all files from this package into the repository root.
3. Commit to the `main` branch.

## Deploy to Cloudflare Pages from GitHub

1. Log in to Cloudflare.
2. Go to **Workers & Pages**.
3. Select **Create application**.
4. Choose **Pages**.
5. Connect your GitHub repository.
6. Use these build settings:

```text
Framework preset: None
Build command: leave blank
Build output directory: /
Root directory: /
```

7. Deploy.

## Deploy with Wrangler CLI

Install Wrangler and deploy directly:

```bash
npm install
npm run deploy
```

You may need to update the project name in `wrangler.toml`.

## Required update before production

Open `index.html` and replace:

```text
https://formspree.io/f/your-form-id
```

with your actual lead capture endpoint, such as Formspree, HubSpot, Salesforce, Marketo, or a Cloudflare Worker.

## Suggested production enhancements

- Add a privacy policy URL.
- Add analytics using Cloudflare Web Analytics or another approved analytics tool.
- Connect the form to a CRM.
- Add downloadable PrivacyIQ overview PDF.
- Add an AWS reference architecture image or modal.
- Add a case study or proof section when available.
