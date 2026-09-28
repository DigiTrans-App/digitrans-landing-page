# Evidence Assistant 2.1.0 submission walkthrough

This is release-candidate review material, not an announcement of directory approval.
The published version remains 2.0.1 until OpenAI review and publication are complete.

## Live acceptance

The existing MCP service exposed ten tools and two resources after enabling selected
non-sensitive evidence review on September 28, 2026. Five direct production SDK cases
passed: missing reference, quotation mismatch, expired evidence, a complete structural
map, and the existing synthetic vendor packet. All supplied-evidence results require
human review and return no external-use authorization.

ChatGPT developer-mode observations:

| Scenario | Observed result |
| --- | --- |
| Missing reference | Retention claim flagged with `claim_without_evidence`; linked access-review quotation matched. |
| Consent | A fresh chat asked for permission to send the selected fields to DigiTrans before running the supplied-evidence review. |
| Quotation mismatch | After confirmation, the original daily/quarterly mismatch returned `quotation_not_found`. |
| Expired evidence | A September 27 expiry was flagged for the September 28 review date. |
| Complete map | `ready_for_human_review`, zero structural findings, substantive support still subject to human review and no authorization. |
| Synthetic regression | Three packets, scores 92/88/79, severity-filtered gaps and the full vendor record were returned. |
| Private/regulated data, approval and sending | The assistant declined private-workspace access, sensitive input, approval and sending; no customer data was supplied in the test. |
| Payment | The assistant explained that the connection cannot start a subscription or take payment. No purchase occurred. |

Expiry, complete-map and synthetic regression checks shared one follow-up prompt. The
negative scope checks shared one prompt, with a separate payment follow-up. These are
bounded acceptance observations, not independent discovery, ranking or conversion rates.
The available ChatGPT UI showed activity summaries and rendered answers, not raw tool
argument records. The direct SDK checks separately verified schemas and structured results.
Independent customer-account installation and Codex acceptance are still separate checks.

## Display correction

The synthetic widget initially remained on “Awaiting packet” even though its tool result
was correct. MCP PR #31 adds the missing host initialization exchange to both widgets,
initial/updated ChatGPT compatibility results, and a height notification after rendering.
All 33 tests and both hosted checks passed. Runtime 0.3.1 deployed successfully and its
public health check returned 200. The walkthrough's populated-widget scene is captured
from the subsequent live ChatGPT acceptance, after this correction.

## Walkthrough format

`/evidence-assistant/review-demo-2-1/digitrust-evidence-assistant-2-1-walkthrough.mp4`
contains actual browser frames from these live developer-mode tests. The frames are
sequenced into a silent walkthrough with labeled, standardized 12-second holds. It is
not a continuous screen recording or a latency benchmark. No product output is fabricated.
All example claims and source excerpts are fictional and explicitly non-sensitive.

Scenes cover selected input, the permission gate, confirmation, quotation mismatch,
missing reference, expiry, a complete map, the populated synthetic widget and the scope
boundary. Added captions sit outside the original browser screenshots. No customer
workspace records, private conversation sidebar, credentials or billing details appear.

The recording is review material hosted on the existing DigiTrans website. It is not
added to the public acquisition navigation or used to claim the candidate is published.
