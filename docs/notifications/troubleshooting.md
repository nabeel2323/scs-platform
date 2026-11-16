# Notification Troubleshooting

## Resend

| Symptom | Likely cause | Result |
|---|---|---|
| `deliveryOutcome: 'rejected'`, `RESEND_REJECTED` | Invalid Resend API key (401) or unverified domain (400) | Regular OTP: challenge preserved, no retry. Bootstrap OTP: challenge cleaned up, delivery marked DELIVERY_FAILED. |
| `deliveryOutcome: 'unknown'` | Resend timeout or network error | Challenge preserved, no retry |
| `deliveryOutcome: 'rejected'`, `RESEND_NOT_CONFIGURED` | `EMAIL_PROVIDER=resend` but `RESEND_API_KEY` or `RESEND_FROM` missing | Provider not configured |

## SMTP

| Symptom | Likely cause | Result |
|---|---|---|
| `EMAIL_PROVIDER_NOT_CONFIGURED` | SMTP not configured (missing `SMTP_HOST` or `SMTP_FROM`) | Email channel cannot deliver |
| `NO_OTP_CHANNEL_AVAILABLE` | No permitted OTP channel can deliver | No delivery path at all |

## Bootstrap OTP

| Symptom | Meaning |
|---|---|
| `deliveryStatus: 'DELIVERY_TIMEOUT'`, `possiblyDelivered: true` | Bootstrap OTP timed out; the code may have been sent |
| `deliveryStatus: 'DELIVERY_FAILED'` | Bootstrap OTP rejected; challenge cleaned up |

## General

- No automatic fallback between SMTP and Resend providers.
- `deliveryOutcome: 'accepted'` means the provider accepted the request — not confirmed mailbox delivery.
- API keys and credentials never appear in logs or error messages.

