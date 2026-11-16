# Resend Email Provider

This document describes the Resend HTTPS API email provider for OTP delivery on the SCS Platform.

## Resend account setup

1. **Create a Resend account** at [resend.com](https://resend.com).
2. **Generate an API key** in the Resend dashboard (API Keys section). Treat this as a secret: never commit it, never log it, and never share it.
3. **Verify a sending domain** in the Resend dashboard (Domains section). The sender address used for OTP emails must belong to a verified domain.
4. **Configure SPF and DKIM DNS records** as instructed by Resend during domain verification. These records live at your DNS provider, not in this repository.
5. **Configure a DMARC policy** appropriate for your domain (e.g. `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com`).
6. **Set the sender address** (`RESEND_FROM`). It must be an address from a verified domain (e.g. `noreply@yourdomain.com`).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `EMAIL_PROVIDER` | No (default `smtp`) | `smtp` or `resend`. Selects which email provider handles the email channel. |
| `RESEND_API_KEY` | Yes when `EMAIL_PROVIDER=resend` | Resend API key. Never log or commit this value. |
| `RESEND_FROM` | Yes when `EMAIL_PROVIDER=resend` | Verified sender email address. |
| `RESEND_FROM_NAME` | No | Optional sender display name. |

Example (all placeholders — do not use real values):

```
EMAIL_PROVIDER=resend
RESEND_API_KEY=
RESEND_FROM=
RESEND_FROM_NAME=
```

## Provider behavior

### Selecting Resend

Set `EMAIL_PROVIDER=resend` and supply `RESEND_API_KEY` and `RESEND_FROM`. Resend becomes the enabled email provider when credentials are present, `OTP_CHANNELS` permits `email` (default), and `EMAIL_PROVIDER=resend`. SMTP credentials are ignored in this mode.

### Retaining SMTP

Set `EMAIL_PROVIDER=smtp` (default) and supply SMTP credentials (`SMTP_HOST`, `SMTP_FROM`, etc.). Resend is not enabled even if `RESEND_API_KEY` is present.

### Local MailHog

For local development without a real email service:

```
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@scsp.dev
SMTP_SECURE=false
```

### Delivery outcome semantics

`deliveryOutcome: 'accepted'` means Resend accepted the email request — it is **not** confirmed mailbox delivery. Resend may still bounce or suppress the message after acceptance.

### Timeout and unknown outcomes

The provider enforces a bounded 10s delivery timeout. On timeout or network error the result is:

- `deliveryOutcome: 'unknown'`
- `retryable: false`
- The OTP challenge is preserved (no cleanup), so a subsequent attempt can still verify the code.

### No automatic fallback

Automatic fallback between Resend and SMTP is intentionally avoided. Fallback would cause duplicate or ambiguous delivery when both providers are configured, and would hide misconfiguration (e.g. silently sending through the wrong provider). If Resend is selected but unreachable, delivery fails explicitly rather than silently switching to SMTP.

## Render deployment

- Render Free blocks outbound SMTP ports 25, 465, and 587, so SMTP may not work on Render Free.
- Resend uses HTTPS API communication (port 443), which works on Render Free.
- Resend is the recommended production email path for Render Free deployments.
- API acceptance does not guarantee mailbox delivery. Monitor Resend delivery events and bounces separately.

## Security

- The Resend API key is never logged or included in error messages.
- OTP values and full email addresses are never logged; emails are masked.
- A missing API key or sender address causes `deliveryOutcome: 'rejected'` with `RESEND_NOT_CONFIGURED`, never a silent send.

## Email OTP authentication feature switch

The API email-OTP routes are gated by the API process environment variable `FLAG_AUTH_EMAIL_OTP`, not by the PostgreSQL `feature_flags` table. Set `FLAG_AUTH_EMAIL_OTP=true` in the API service environment (for example, the Render API service) and restart/redeploy that service. The API reads the value at request time; only the case-insensitive string `true` enables the routes. Missing or any other value keeps them disabled. No database update or migration is required. The historical `auth.email_otp.enabled` row created by migration 0064 is no longer consulted by the runtime gate.
