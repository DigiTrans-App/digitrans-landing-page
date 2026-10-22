# Synthetic walkthrough release candidate

The homepage now lets a visitor compare two fixed fictional workflows: referral
intake and documentation evidence. Native selects switch between supported
evidence, an unsupported draft claim and a lost handoff response. The source note,
draft, checks, review boundary and recorded/blocked/uncertain outcome stay visible
together. Text and labels communicate the state without relying on color.

For the lost response, a button reveals a fixed matching receipt for the original
example. It does not retry the action. Switching workflows discards the earlier
example's receipt observation. The copy explains that missing or conflicting
receipts would leave the outcome unresolved. The static referral example remains
readable without JavaScript.

This is an illustrative browser interaction, not an end-to-end product test or a
model invocation. The module has no network, persistence or analytics path, and
accepts no customer input. No account name, customer endorsement, private sales
information, clinical outcome or production deployment is represented.

The architecture page now distinguishes the recovery source candidate, provider
evaluation, review-workspace update and open installed-release acceptance. Its
portability language keeps AWS as the first case and additional hosts unaccepted.

Validation: 31 Node tests pass, including seven new walkthrough cases. Existing
HTML/canonical/link, public-claims, plain-language and commercial-boundary checks
pass locally. The browser service blocked the local visual preview; desktop/mobile
layout and keyboard/screen-reader acceptance still require an accessible preview.
This change does not itself establish a published production-site revision.
