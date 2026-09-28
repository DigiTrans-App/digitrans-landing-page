# Assisted onboarding customer path

## Reason for this change

The live AWS Marketplace catalog already described assisted onboarding at revision 24. Search snapshots still carried older language and were not a reliable view of the current offer. The remaining customer-path discrepancy was that workspace setup links opened a pilot-only intake, while new customers were directed to sign in before access had been arranged.

## Customer experience

1. Request assisted onboarding at `/get-started?intent=assisted-onboarding#intake`.
2. DigiTrans confirms the first workflow and applicable subscription, prepares the workspace and arranges access. Marketplace subscribers complete the registration handoff as directed by DigiTrans.
3. Approved participants sign in and complete a guided first example.
4. Customer-data use begins after the agreed scope, protections and operating requirements are accepted.

The homepage and engagement page lead with assisted onboarding. Their shared onboarding block, the buying guide, intake and receipt use the same sequence. Optional pilots keep separate links and separately agreed services terms. The existing subscription tiers, allowances, prices and contract terms are unchanged.

## Intake and measurement

`assisted-onboarding` is allowlisted in the browser tracker, event endpoint and intake endpoint. It is preserved in the fixed-recipient notification and aggregate lead category. The fixed notification subject now covers onboarding and engagement requests. Direct requests without campaign context default to `engagement-guidance`.

Required fields, privacy boundaries, delivery transport and fail-closed validation are unchanged. Mocked transport tests cover onboarding categorization without sending an email. Analytics tests cover the new category across the client and server normalizers.

## Publication checks

- Run JavaScript syntax checks, the Node test suite and the existing pull-request validation workflows.
- Verify the rendered onboarding CTA and intake form on the deployment preview, without submitting the form.
- Confirm `/api/events` reports `durable_storage: true` and `/api/intake` reports `delivery_configured: true` before promotion.
- Verify the production customer path before publishing the matching AWS Marketplace description, highlight and support instructions.
- Preserve Marketplace fulfillment configuration and all commercial terms. Search snapshots can lag the published catalog and website.
