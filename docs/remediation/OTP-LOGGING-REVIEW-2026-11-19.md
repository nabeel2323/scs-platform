# OTP Logging Security Review — 19 November 2026

**Finding:** P0-10 / P1-13 — verification codes and sensitive recipient data in application logs  
**Environment inspected:** Render staging service `scs-api-staging`  
**Method:** Source comparison between `develop` and the remediation branch; read-only Render log search  
**Mutation performed:** None

## Executive result

The deployed `develop` source contains raw provider-exception logging paths that could disclose request payload or recipient information when an upstream exception embeds those values. The remediation branch now logs bounded error types instead of raw exception messages, adds Pino request-body redaction paths, and adds synthetic regression tests.

The sampled Render logs from 18–19 November did not reproduce the earlier reported plaintext OTP: a search for the OTP-delivery exception message returned no entries, and a six-digit-pattern search returned no matching entries. This is a bounded sample, not proof that all historical logs are clean or that the exact earlier leak source has been conclusively identified.

## Source findings

1. **OTP delivery service:** the `develop` catch path logged the raw provider exception message. The remediation branch records the exception type only and preserves a correlation identifier.
2. **Twilio and WhatsApp adapters:** the `develop` network and unexpected-error catch paths logged raw exception messages. The remediation branch records a bounded error class and correlation ID without the exception message.
3. **HTTP request logging:** the `develop` Pino redaction list covered authorization/cookie headers only. The remediation branch adds redaction paths for OTP, code, verificationCode, passwords, refresh/access tokens, token, secret and API-key body fields. This is defense-in-depth; no request body is intentionally added to the log serializer.
4. **Bootstrap and audit paths:** the owner-bootstrap flow passes the OTP to the delivery provider but does not log the code. The audit middleware records route, status, actor and request metadata, not the request body.
5. **SMTP provider:** the inspected SMTP success/error logs record message/correlation identifiers and stable error reasons; they do not log the message body or OTP.

## Runtime log sampling

- Render log search for `Unexpected error during OTP delivery` between 18 and 19 November returned no entries.
- A six-digit-pattern search over the same sampled service log window returned no entries.
- This does not establish that no earlier OTP values were logged; the prior reported finding remains a valid incident signal until the complete relevant retention window is reviewed.

## Regression coverage added

- OTP delivery service exception test: synthetic OTP and recipient data embedded in a provider exception must not appear in captured logs.
- Twilio network-error test: synthetic OTP and phone data embedded in a rejected fetch error must not appear in captured logs.
- WhatsApp network-error test: the same redaction guarantee is asserted.
- Existing success/failure redaction coverage remains in place.

## Deployment boundary

The current Render service still runs branch `develop` and has auto-deploy disabled. These code changes are only on the remediation PR branch; they are not live. No OTP was sent, no staging deployment/restart was triggered, and no secrets or verification codes were reproduced in this report.

The release workflow is a real mutating release path: it runs database migrations and RBAC seed before deployment. Do not trigger it merely to verify log redaction. After the PR's CI passes, use an approved staging release and synthetic test account, then re-run the log checks without printing or retaining any OTP value.

## Status

**PARTIAL — source paths hardened; CI and deployed-runtime verification pending.** The code fix is committed on the remediation branch. The exact source of the previously observed plaintext OTP has not been conclusively tied to a specific historical log entry.
