# Notification Provider Selection

This document explains how the SCS Platform selects the notification provider for OTP delivery.

## `EMAIL_PROVIDER`

`EMAIL_PROVIDER` selects which email provider handles the `email` channel. Two values are supported:

| Value | Provider | Notes |
|---|---|---|
| `smtp` (default) | SMTP via Nodemailer | MailHog-compatible for local dev. Requires an SMTP server for production. |
| `resend` | Resend HTTPS API | Works on Render Free where outbound SMTP ports are blocked. |

Default: `smtp`.

## Channel permission via `OTP_CHANNELS`

`OTP_CHANNELS` is a comma-separated allowlist of permitted OTP channels. It defaults to `email` only. Setting Twilio/WhatsApp credentials does **not** enable SMS/WhatsApp unless those channels are also listed in `OTP_CHANNELS`.

## Two-axis model

Delivery requires all three of the following to be true for a channel:

1. **Permission** — the channel is listed in `OTP_CHANNELS` (defaults to `email`).
2. **Credential presence** — the provider's required credentials are present (e.g. `SMTP_HOST` + `SMTP_FROM`, or `RESEND_API_KEY` + `RESEND_FROM`).
3. **Provider selection** — `EMAIL_PROVIDER` selects the email provider (`smtp` or `resend`).

A provider is `enabled` only when permission AND credential presence AND (for email) provider selection all hold. A channel that is permitted but unconfigured is reported as an actionable problem, not silently ignored.

## Examples

SMTP (default):

```
EMAIL_PROVIDER=smtp
OTP_CHANNELS=email
SMTP_HOST=...
SMTP_FROM=noreply@scsp.dev
```

Resend:

```
EMAIL_PROVIDER=resend
OTP_CHANNELS=email
RESEND_API_KEY=...
RESEND_FROM=noreply@yourdomain.com
```

MailHog locally:

```
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@scsp.dev
```

No provider automatically substitutes for another. If the selected email provider is not configured, OTP delivery fails with `EMAIL_PROVIDER_NOT_CONFIGURED` (or `NO_OTP_CHANNEL_AVAILABLE` if no permitted channel can deliver).
