# AWS SES intake delivery setup

This procedure configures the landing-page intake endpoint to send one fixed notification from `forms@notify.digitranshq.com` to `info@digitranshq.com`. Customer-provided addresses are used only as Reply-To values.

The setup does not require Cloudflare Email Routing and must not replace the Microsoft 365 MX records for `digitranshq.com`.

## 1. Verify the sending identity

1. Choose the AWS Region that will own the SES identity and credentials. Use the same Region in every step below.
2. In **Amazon SES > Configuration > Verified identities**, create a **Domain** identity for `notify.digitranshq.com`.
3. Keep Easy DKIM enabled.
4. Add the SES-generated DKIM CNAME records to the `digitranshq.com` zone in Cloudflare DNS.
5. Wait until the SES identity shows **Verified** and DKIM shows **Successful**.

Do not add or replace root-domain MX records. A custom MAIL FROM domain is optional and is not required by this intake implementation.

AWS documents that SES identities and DKIM configuration are Region-specific: <https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html>.

## 2. Verify the fixed recipient when necessary

If the SES account is still in the sandbox, create a second SES identity of type **Email address** for `info@digitranshq.com` and approve the verification message in that mailbox.

The fixed-recipient workflow can remain in the sandbox because the sender domain and recipient are verified. Request SES production access only if the application later needs to send to unverified recipients.

AWS sandbox requirements: <https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html>.

## 3. Create a least-privilege sender identity

Create a dedicated IAM user without console access, then attach the following inline policy. Replace `AWS_REGION` and `AWS_ACCOUNT_ID` before saving it.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendOnlyLandingPageIntake",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:AWS_REGION:AWS_ACCOUNT_ID:identity/notify.digitranshq.com",
      "Condition": {
        "StringEquals": {
          "ses:FromAddress": "forms@notify.digitranshq.com"
        },
        "ForAllValues:StringEquals": {
          "ses:Recipients": "info@digitranshq.com"
        }
      }
    }
  ]
}
```

This policy grants only `ses:SendEmail`; it does not grant raw-email, identity-management, read, or administrative permissions. AWS documents the SES sender and recipient condition keys at <https://docs.aws.amazon.com/service-authorization/latest/reference/list_ses.html>.

Create one access key for this IAM user. Never use root credentials, add the key to client-side JavaScript, or commit it to the repository.

## 4. Configure Cloudflare Pages

In **Workers & Pages > digitranshq > Settings > Variables and Secrets**, set the following in both Preview and Production:

| Name | Storage | Value |
| --- | --- | --- |
| `AWS_SES_REGION` | Variable | The Region selected above, such as `us-east-1` |
| `AWS_SES_ACCESS_KEY_ID` | Encrypted secret | Dedicated IAM access key ID |
| `AWS_SES_SECRET_ACCESS_KEY` | Encrypted secret | Dedicated IAM secret access key |

`AWS_SES_SESSION_TOKEN` is optional and should be configured only when all three credential values come from the same temporary AWS session.

Redeploy the corresponding Pages environment after changing any value.

## 5. Verify before merging

1. Open `GET /api/intake` on the PR preview and confirm:

   ```json
   {"status":"ok","delivery_provider":"aws_ses_v2","delivery_configured":true,"schema_version":"1"}
   ```

2. Submit one controlled request through the PR preview.
3. Confirm the browser reaches `/intake-thank-you/`.
4. Confirm the message arrives at `info@digitranshq.com` and Reply-To contains the submitted test address.
5. Confirm the preview Analytics Engine dataset contains one `lead_submitted` event with placement `aws_ses_intake` and no form values.
6. Review the SES sending activity for an accepted message and verify that no unexpected recipient appears.

The endpoint fails closed: it returns the visitor to the form with a visible retry message when configuration, request signing, or SES acceptance fails.

## 6. Rotate credentials

1. Create a second access key on the same restricted IAM user.
2. replace the two encrypted Pages credential secrets and redeploy Preview.
3. Repeat the health check and controlled preview submission.
4. Update Production and redeploy.
5. Disable the old key, observe the intake endpoint, and then delete the old key.

Keep no more than one active key after the rotation is complete.
