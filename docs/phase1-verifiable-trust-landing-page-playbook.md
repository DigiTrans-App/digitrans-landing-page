# Phase 1 Verifiable Trust Landing Page Codex Playbook

## Mission

Uplift the DigiTrans landing page so DigiTrust is presented as **verifiable trust infrastructure for the AI era** while preserving the current commercialization funnel, pricing path, intake flow, public ChatGPT demo boundaries, and existing legal/privacy pages.

Work only on branch:

`phase1-verifiable-trust-landing-page`

Repository:

`DigiTrans-App/digitrans-landing-page`

## Primary outcome

The site must communicate a clear platform narrative:

**Evidence Fabric → Verification Engine → Assurance Outputs**

Evidence Packets remain an important product outcome, but they should no longer be presented as the entire platform.

## Non-negotiable positioning

Use this core statement consistently:

> DigiTrust is verifiable trust infrastructure for the AI era.

Supporting message:

> DigiTrust turns cloud and enterprise evidence into verifiable assurance through immutable provenance, deterministic evidence-quality verification, governed agents, and signed outputs.

Do not claim that DigiTrust is generally available, production-certified, AWS-endorsed, AWS Marketplace-listed, or deployed with production customer evidence.

## Required implementation

### 1. Preserve existing conversion paths

Do not break or remove:

- `/get-started.html`
- `/pricing/`
- `/privacy/`
- `/privacy/digitrust-evidence-assistant/`
- `/terms/`
- `/news/digitrust-evidence-assistant-chatgpt/`
- campaign attribution behavior in `assets/site.js`
- the current intake flow

All existing primary CTAs must remain functional.

### 2. Update homepage metadata

Update:

- `<title>`
- meta description
- Open Graph title/description/image
- Twitter title/description/image
- SoftwareApplication structured-data description

Use the hosted Marketplace logo for social preview only if its square composition works acceptably. Otherwise retain the existing social image and document why.

Recommended title:

`DigiTrust | Verifiable Trust Infrastructure for the AI Era`

Recommended meta description:

`DigiTrust turns cloud and enterprise evidence into verifiable assurance through immutable provenance, deterministic evidence-quality verification, governed agents, and signed outputs.`

### 3. Update navigation

Desktop navigation should include, in this order where practical:

- Platform
- Architecture
- Evidence Quality
- AWS
- ChatGPT Demo
- Pricing
- Trust

Use in-page anchors for homepage sections except the public reference architecture page.

The Architecture item should link to:

`/reference-architecture/`

### 4. Update hero

Use:

**Headline**

`Turn enterprise evidence into verifiable assurance.`

**Lead**

`DigiTrust is verifiable trust infrastructure for the AI era.`

**Supporting copy**

Explain that DigiTrust combines an immutable Evidence Fabric, deterministic Verification Engine, governed agents, and signed assurance outputs.

Preserve the current CTA hierarchy:

- Request a walkthrough
- Review pricing
- Try the public demo

Keep the soft-launch and demo-boundary language accurate.

### 5. Replace the right-side hero proof card

Evolve the proof card from a single Evidence Packet summary into a concise trust pipeline card showing:

1. Evidence captured
2. Provenance preserved
3. Quality verified
4. Trust decision explained
5. Assurance output signed

Use outcome-oriented status labels. Avoid claiming production-grade cryptographic non-repudiation.

### 6. Add Platform architecture section

Create a section with anchor `platform` that visually communicates:

- Evidence Fabric
- Verification Engine
- Assurance Outputs

Each card must explain what the layer does and how it contributes to verifiable trust.

Include a short line explaining that Evidence Packets are one governed assurance output produced by the platform.

### 7. Add Evidence Quality section

Create a section with anchor `evidence-quality` containing eight dimensions:

- Integrity
- Authority
- Provenance
- Freshness
- Lifecycle
- Relevance
- Completeness
- Independence

Use concise, buyer-readable descriptions grounded in deterministic metadata and policy checks.

Required statement:

> DigiTrust verifies the quality of evidence, not merely whether a document exists.

Do not imply semantic truth inference or content-level contradiction analysis is already available.

### 8. Update the workflow section

Evolve the current four-step workflow to:

1. Capture
2. Preserve
3. Verify
4. Assure

Explain:

- capture authoritative evidence and context;
- preserve lineage and chain of custody;
- verify quality and claim support deterministically;
- produce signed, audience-appropriate assurance outputs.

### 9. Add AWS section

Create a section with anchor `aws` titled:

`Preparing the AWS Trust Verification Reference Pattern`

Explain that AWS is the first planned flagship cloud reference integration.

Describe the intended pattern at a high level:

- collect authorized AWS evidence;
- preserve provenance and chain of custody;
- verify quality and claim support;
- generate signed assurance outputs.

Use careful language such as:

- planned
- preparing
- reference pattern
- candidate AWS evidence sources
- to be validated through the upcoming AWS engagement

Do not state or imply AWS endorsement, partnership tier, Marketplace availability, or production integration.

### 10. Preserve and refine ChatGPT section

Keep the public demo section and its existing boundaries.

Clarify that the ChatGPT app is a public trust surface using synthetic evidence and read-only tools.

### 11. Preserve commercial QuickStart

Retain the Evidence Packet QuickStart as the recommended first paid engagement.

Reframe it as a practical entry point into the broader DigiTrust platform rather than the whole product.

### 12. Add public reference architecture page

Create:

`reference-architecture/index.html`

The page should include:

- title and summary
- the architecture chain: Evidence → Provenance → Verification → Trust Decision → Assurance Output
- platform layers
- trust principles
- deterministic versus AI-assisted responsibilities
- evidence-quality dimensions
- security and privacy boundaries
- current maturity and limitations
- planned AWS reference integration
- CTA to request a walkthrough

Use the same navigation, footer, visual system, accessibility conventions, campaign attribution, and legal links as the main site.

### 13. Update sitemap

Add:

`https://www.digitranshq.com/reference-architecture/`

Use the implementation date as `lastmod`.

### 14. Logo asset

The branch already contains:

`assets/digitrust-aws-marketplace-logo-640.png`

Do not modify or recompress it unless validation shows corruption.

Expected public URL after deployment:

`https://www.digitranshq.com/assets/digitrust-aws-marketplace-logo-640.png`

## Design direction

Preserve the current visual identity:

- dark navy
- AWS-appropriate blue
- trust-oriented teal/green
- rounded cards
- strong whitespace
- accessible contrast

The uplift should feel more architectural and category-defining, but not like an unrelated redesign.

Avoid:

- excessive animation
- stock photos
- generic AI imagery
- unsupported security badges
- AWS logos or trademarks unless explicitly authorized
- dense diagrams that fail on mobile

## Accessibility

Maintain or improve:

- semantic landmarks
- heading hierarchy
- keyboard navigation
- visible focus states
- alt text
- mobile responsiveness
- reduced-motion behavior
- color contrast

## Accuracy boundaries

The site may describe implemented reference capabilities such as:

- immutable artifact integrity
- lifecycle lineage
- provenance projection
- signed audit exports
- deterministic evidence-quality verification
- governed agent and delegation checks
- signed verification reports

Qualify current maturity appropriately:

- reference implementation
- design-partner stage
- limited onboarding
- production hardening in progress

Do not claim:

- general availability
- independent certification
- production KMS signing
- active AWS Marketplace listing
- AWS endorsement
- production customer deployments unless separately confirmed

## Validation requirements

At minimum:

1. Run a local static server and inspect:
   - `/`
   - `/reference-architecture/`
   - `/pricing/`
   - `/get-started.html`
   - `/privacy/`
   - `/terms/`

2. Verify all internal links return expected pages.
3. Verify no console errors on homepage and reference architecture page.
4. Verify mobile layouts at approximately 390px, 768px, and desktop width.
5. Verify the Marketplace logo returns as PNG and remains under 5 MB.
6. Verify title, meta description, canonical, Open Graph, and Twitter tags.
7. Verify JSON-LD remains valid JSON.
8. Verify `sitemap.xml` includes the architecture page.
9. Verify `git diff --check` is clean.
10. Inspect the complete diff before committing.

If the repository has no automated test suite, document the manual validation performed.

## Commit discipline

Use focused commits such as:

1. `Add DigiTrust Marketplace logo asset`
2. `Reposition homepage around verifiable trust infrastructure`
3. `Add evidence quality and AWS reference sections`
4. `Publish DigiTrust reference architecture page`
5. `Update metadata sitemap and validation notes`

Do not commit temporary screenshots, local server output, or generated caches.

## Definition of done

Phase 1 is complete only when:

- the homepage leads with verifiable trust infrastructure;
- the Evidence Fabric → Verification Engine → Assurance Outputs model is visible;
- all eight evidence-quality dimensions are explained;
- the AWS reference-pattern section is accurate and qualified;
- the public reference architecture page exists;
- existing commercial, intake, demo, privacy, terms, and pricing paths still work;
- the Marketplace logo is served from the intended path;
- mobile and accessibility checks pass;
- the branch is pushed and a draft PR is opened against `main`;
- nothing is merged before architecture and messaging review.

## Final report

Return:

- branch name;
- remote head SHA;
- commit list;
- changed-file list;
- page and link validation results;
- responsive/accessibility checks;
- metadata and structured-data checks;
- Marketplace logo validation;
- known limitations;
- draft PR URL.
