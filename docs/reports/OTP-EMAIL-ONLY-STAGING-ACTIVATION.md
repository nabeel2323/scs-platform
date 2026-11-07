# OTP Email-Only Staging Activation

**Status:** Implemented and locally verified. **Not deployed. Not staging-ready by assertion.**
**Branch:** `feature/otp-auth-security-hardening`
**Date:** 2026-11-07
**Scope:** Make EMAIL the only permitted OTP delivery channel for the initial SCS staging release, keep SMS inert but intact, and stop every client from claiming a delivery the provider never accepted.

This report is evidence-based. Every claim below cites `file:line` in this repository or a named test that was actually executed. Where something was **not** done, it says so. Local test success is not evidence that a hosted environment is configured correctly — no hosted environment was touched.

---

## 1. Authorization boundary (what was and was not done)

The following restrictions were honoured throughout. None of these actions was performed:

| Restriction | Status |
| --- | --- |
| Do not configure Render | Not touched |
| Do not configure Supabase | Not touched |
| Do not configure a real email provider | Not touched — no SMTP credential was created, entered or used |
| Do not send real OTP messages | None sent. All delivery tests use a mocked `nodemailer` transport or the internal mock provider |
| Do not configure Twilio | Not touched |
| Do not merge or deploy | No merge, no deploy, no PR merge |
| Do not apply migration 0066 to staging | Not applied anywhere |
| Do not expose secrets in reports or logs | This report contains placeholders only; the code's readiness messages and logs are asserted never to echo credential values |

Changes are confined to application source, tests, and the two environment **templates** (`.env.example`, `infra/deploy/.env.production.example`). Editing a template is documentation; it does not configure any environment.

---

## 2. Design: permission and credentials are two separate axes

The central decision is that **whether a channel is allowed** and **whether a channel has credentials** are independent questions. Conflating them is what made "set Twilio vars" accidentally enable SMS, and what made "no Twilio vars" look like a startup failure.

```
permitted         = channel ∈ OTP_CHANNELS allowlist        (operator intent)
credentialsPresent = provider has the values it needs       (environment fact)
enabled           = permitted && credentialsPresent         (what may actually send)
```

- Allowlist variable and default: `apps/api/src/modules/notifications/providers/provider.config.ts:27` (`OTP_CHANNELS_ENV_VAR = 'OTP_CHANNELS'`) and `:33` (`DEFAULT_OTP_CHANNELS = ['email']`).
- Parsing, trimming, de-duplication and rejection of unknown names: `provider.config.ts:64-99`. An empty-after-trim value or an unknown token throws `OtpChannelConfigurationError`; it is never silently ignored.
- Configurable names are exactly `email`, `sms`, `whatsapp` (`provider.config.ts:36`). The internal `mock` channel is **not** configurable.
- Permission predicate: `provider.config.ts:101-109`, surfaced as `ProviderRegistryService.isChannelPermitted` at `apps/api/src/modules/notifications/provider-registry.service.ts:148-150`.
- Availability predicate (credentials only): `provider-registry.service.ts:135`. The docblock at `:143-147` states explicitly that the two are deliberately separate.
- SMTP enablement: `provider.config.ts:299-301` — `credentialsPresent = !!(host && from)`, `enabled = credentialsPresent && permitted`.
- Twilio enablement: `provider.config.ts:196` plus the "DISABLED by OTP_CHANNELS (email-only release)" log at `:204`. WhatsApp likewise at `:254` / `:260`.

**Consequence:** full Twilio credentials sitting in the environment do not enable SMS, and absent Twilio credentials do not produce a readiness problem while SMS is not permitted.

---

## 3. Requirement-by-requirement evidence

### Requirement 1 — email is the primary and only enabled channel

- Default allowlist is email alone: `provider.config.ts:33`.
- The delivery router refuses a non-permitted public channel **before** it touches any provider: `apps/api/src/modules/notifications/otp-delivery.service.ts:150-158`, returning `errorReason: '<CHANNEL>_CHANNEL_DISABLED'` and `deliveryOutcome: 'rejected'`.
- Password-login second factor now consults permission: `apps/api/src/modules/identity/identity.service.ts:1973-1983`. `phoneUsable` requires a phone **and** `isChannelPermitted('sms')` **and** `isChannelAvailable('sms')`; `emailUsable` requires an email **and** `isChannelPermitted('email')`. Exactly one send happens; there is no second attempt.
- Proven by `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts`, group *"Second factor channel selection (email-only release)"* — 6 cases, all passing, including a dual-identifier account (email + phone) receiving its second factor by email.

### Requirement 2 — no Twilio or SMS provider configuration required

- `resolveOtpReadiness` only raises `SMS_PROVIDER_NOT_CONFIGURED` when SMS is permitted: `provider.config.ts:382-389`. Same shape for WhatsApp at `:392-398`.
- Boot gate: `apps/api/src/config/otp-delivery-gate.ts:53-83` computes readiness and throws only when `productionLike && !readiness.ready`.
- Tests: `otp-boot-readiness.spec.ts:42` *"boots staging with email configured and no SMS credential anywhere"*; `:66` *"does not demand Twilio credentials while SMS is disabled"*; `otp-email-only-routing.spec.ts:131` *"does not require any Twilio or WhatsApp credential to construct or deliver"*.

### Requirement 3 — SMS disabled by default

- Unset `OTP_CHANNELS` ⇒ `['email']` (`provider.config.ts:67-70`); blank/whitespace is treated as unset (`otp-channel-policy.spec.ts:54`).
- `otp-channel-policy.spec.ts:103` *"keeps SMS disabled even when full Twilio credentials are present"*; `:109` the same for WhatsApp.
- `otp-email-only-routing.spec.ts:148` *"never invokes SMS even when Twilio credentials are present"* — this spec runs the **real** registry, **real** router and **real** providers with `NODE_ENV=production`, mocking only `nodemailer` and spying on `fetch`, `TwilioSmsProvider.prototype.sendOtp` and `WhatsAppProvider.prototype.sendOtp`. The spies record zero calls.

### Requirement 4 — no SMS fallback when email fails

- Structural: `otp-delivery.service.ts:17` documents "There is NO cross-channel fallback. One request produces at most one [send]". The auth OTP path in `identity.service.ts` reaches providers only through `otpDeliveryService` (`:259`, `:531`, `:540`) and contains **no** reference to `NotificationsService`.
- The generic notification path does have SMS primary→fallback→WhatsApp failover (`apps/api/src/modules/notifications/notifications.service.ts:265-330`), but its provider hooks `smsProviderPrimary` (`:353`) and `smsProviderFallback` (`:359`) are stubs with unused parameters, and that path is not the auth OTP path.
- Tests: `otp-email-only-routing.spec.ts:264-320`, group *"email failure never falls back to SMS"* — SMTP recipient rejection, SMTP authentication failure, SMTP timeout (uncertain), and provider entirely unconfigured. Each asserts the SMS and WhatsApp spies were never called.
- Integration: `password-login-regression.postgres.spec.ts` *"does not fall back to SMS when the email second factor is rejected"*.

### Requirement 5 — absent SMS credentials never block startup

- `otp-delivery-gate.ts:70-80`: the only throw is for "no permitted channel can deliver". Absent credentials on a **non-permitted** channel generate no problem at all (`provider.config.ts:382`, `:392`).
- Outside production-like `NODE_ENV` the gate is a no-op (`otp-delivery-gate.ts:54-55`, `isProductionLikeEnv` in `apps/api/src/config/env-gate.ts:32`), so development and test boot with nothing configured.
- Tests: `otp-boot-readiness.spec.ts:73` (development no-op), `:78` (test no-op), `:100` *"warns but still boots when email is unconfigured yet another permitted channel can deliver"`.

### Requirement 6 — missing email configuration produces a clear, actionable error

- Readiness problem `EMAIL_PROVIDER_NOT_CONFIGURED`, raised only when email is permitted, SMTP is not enabled and no mock is available: `provider.config.ts:369-380`. Its message names the exact missing variables and states the consequence:

  > Email is the permitted OTP channel but SMTP is not configured (missing SMTP_HOST and SMTP_FROM). Set SMTP_HOST, SMTP_PORT, SMTP_FROM and — for an authenticated relay — SMTP_USER and SMTP_PASSWORD. OTP requests will fail with EMAIL_PROVIDER_NOT_CONFIGURED until this is set; no SMS fallback exists.

- A production-like process with no deliverable permitted channel refuses to boot with `OtpDeliveryConfigurationError` (`otp-delivery-gate.ts:74-80`), listing each problem code and message. Wired at `apps/api/src/main.ts:60`, with a non-sensitive bootstrap summary at `:61-65`.
- At request time the SMTP provider returns `SMTP_NOT_CONFIGURED` / `deliveryOutcome: 'rejected'` (`apps/api/src/modules/notifications/providers/smtp-email.provider.ts:139-141`) rather than pretending to send.
- Tests: `otp-channel-policy.spec.ts:177` (names the variables), `:206` *"never echoes credential values into a readiness message"*; `otp-boot-readiness.spec.ts:49`, `:53`, `:109`; `otp-email-only-routing.spec.ts:207`, `:218`, `:251`.

### Requirement 7 — email reports its actual outcome

Four distinct outcomes, produced by the provider and classified once for all clients:

| Outcome | Where produced | Classifier result |
| --- | --- | --- |
| Provider accepted | `smtp-email.provider.ts:172-178` (`deliveryOutcome: 'accepted'`, logs the SMTP message id) | `delivered` |
| Provider rejected | `smtp-email.provider.ts:205`, `:211-217` (recipient rejected), `:152` (auth/config failure) | `rejected` |
| Delivery uncertain | `smtp-email.provider.ts:229`, `:241`, `:253`, `:257-264` (timeout / transport error — challenge preserved) | `uncertain` |
| Provider not configured | `smtp-email.provider.ts:139-141` (`SMTP_NOT_CONFIGURED`); readiness `EMAIL_PROVIDER_NOT_CONFIGURED` | `unavailable` |

- The header docblock at `smtp-email.provider.ts:14` is explicit: *"'accepted' means SMTP server accepted — NOT confirmed mailbox delivery."* No code path claims mailbox delivery.
- Single classifier: `packages/contracts/src/index.ts:100-133` (`classifyOtpDelivery`). It reads `success` first, then matches `_NOT_CONFIGURED` and `_CHANNEL_DISABLED` suffixes to `unavailable` (so a deliberately disabled channel is not shown as "check the number"), then `possiblyDelivered` / `DELIVERY_TIMEOUT` / `DELIVERY_ERROR` to `uncertain`, else `rejected`. The API package does not depend on `@scs/contracts`, so the classifier's own tests live in `apps/web/src/__tests__/otp-delivery-classifier.test.ts`.
- A disabled channel is distinguished from an unconfigured provider: `otp-email-only-routing.spec.ts:159` and `:169`.

### Requirement 8 — the frontend never claims an undelivered OTP

- Web: `apps/web/src/app/auth/login/page.tsx:192-205` (phone) and `:245-258` (email) call `classifyOtpDelivery` and only advance to code entry on `delivered` or `uncertain`; anything else renders `deliveryMessage(...)` as an error and stays on the request step. A 2xx is explicitly treated as "request processed", not "sent" (comment at `:189-190`).
- Web second factor: `apps/web/src/lib/auth.ts:509-510` now carries `otpEmail` and `otpDelivery` through; `apps/web/src/app/auth/login/page.tsx:126-152` mirrors the server's channel and only says a code was sent when `otpDelivery === 'accepted'`. A missing `otpDelivery` fails closed to the unconfirmed wording.
- Admin: the same two defects existed and are fixed. `apps/admin/src/lib/auth.ts:453-463` now declares `otpEmail`/`otpDelivery` on the second-factor result and `:495-498` maps them from the API response; `apps/admin/src/app/auth/login/page.tsx:156-184` branches on the channel instead of unconditionally calling `setPhone` / `setMode('otp')`.
- Copy is conditional, not asserted: web `:474` *"If a code arrived on {phone}, enter it below."* for `uncertain`; admin email verify uses *"If a code arrived for {email}, enter it below."* versus *"A code is on its way to {email}. Enter it below."* only for `accepted`.
- Tests: `apps/web/src/__tests__/login-email-only.test.tsx:202`, `:215`; `apps/web/src/__tests__/auth-lib-second-factor.test.ts:80`, `:88`; `apps/admin/src/__tests__/auth-login-email-otp.test.tsx:129`, `:141`, `:158`, `:189`, `:213`; `apps/admin/src/__tests__/auth-login-second-factor-email.test.tsx` (7 cases, including the fail-closed missing-`otpDelivery` case and an assertion that no internal reason code such as `DELIVERY_TIMEOUT` or `SMTP_PROVIDER_NOT_CONFIGURED` leaks into the UI).

### Requirement 9 — expiry, one-time use, throttling, rate limiting and verification security preserved

No TTL, hash, Lua script, throttle or verification rule was changed by this work. The channel policy sits **in front of** delivery, not inside the challenge lifecycle.

Evidence actually executed (see §5 for exact totals):

- `apps/api/src/__tests__/integration/email-otp-security.postgres.spec.ts` — expiry, single use, attempt limits, hash/salt, enumeration resistance.
- `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts` — request → verify → session, resend throttling.
- `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts` — email identity linking protections.
- `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` — 30 cases including bcrypt-burn timing equality, normalized rate-limit keys, audit hashing, and *"an OTP-challenged login creates no session"*.
- `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts` — S-1 credential issuance/revocation, password-change and logout revocation.
- `apps/api/src/__tests__/integration/phone-otp-regression.postgres.spec.ts` — 11 cases, proving the preserved SMS path still behaves correctly when explicitly permitted (requirement 11).
- `apps/api/src/__tests__/integration/throttle-ip-isolation.spec.ts` — **skipped** (3 tests). It requires a disposable real Redis (`REDIS_IT=1`, `REDIS_URL`, `REDIS_DISPOSABLE_ACK=1`) which was not provisioned in this session. This is a verification gap, not a pass.

### Requirement 10 — admin, web buyer and merchant flows use email OTP

- **Web buyer and merchant share one login.** There is a single web auth route (`apps/web/src/app/auth/login/page.tsx`); the merchant area gates on the session and redirects unauthenticated users to it (`apps/web/src/app/merchant/layout.tsx:54`, `router.replace('/auth/login')`). After login, an account with no organization is sent to `/merchant/register` (`login/page.tsx:104-106`). So the merchant flow inherits the same email-first behaviour; there is no separate merchant OTP implementation to diverge.
- Web login now offers two tabs, "Email/Password" and "Email OTP", and the passwordless CTA "Sign in with OTP" opens the **email** request form (`login/page.tsx:314-320`, `:410`). The phone form remains reachable only through an explicit "Use phone number instead" link — see the limitation in §7.
- Admin login defaults to email and never calls the phone route: `apps/admin/src/__tests__/auth-login-email-otp.test.tsx:114`. Admin password second factor follows the server's channel: `auth-login-second-factor-email.test.tsx` cases 3–5.
- Server side, both clients hit the same policy-gated endpoints, so the channel choice cannot differ per client: `apps/api/src/modules/identity/identity.service.ts:1973-1983` and `otp-delivery.service.ts:150-158`.

### Requirement 11 — SMS preserved, not activated

- `TwilioSmsProvider` and `WhatsAppProvider` are unchanged in behaviour and still constructed; they are simply not permitted. `provider.config.ts:196-210` and `:254-266` keep credential resolution and log "DISABLED by OTP_CHANNELS; credentials present but unused".
- Re-enabling is a configuration change, not a code change: `otp-channel-policy.spec.ts:64` *"permits SMS only when the operator lists it (the future activation path)"*; `otp-email-only-routing.spec.ts:192` *"can be explicitly re-enabled for the future SMS phase"*; `password-login-regression.postgres.spec.ts` *"keeps the phone second factor when a later phase re-enables SMS (requirement 11)"*.
- The phone endpoints keep their existing defaults — `apps/api/src/modules/identity/auth.controller.ts:127` (`dto.channel || 'sms'`) and `identity.service.ts:199` (`channel: OtpDeliveryChannel = 'sms'`). **These were deliberately not changed.** They are the defaults of the *phone* endpoint, and the policy gate refuses a non-permitted channel before any provider is touched (`otp-delivery.service.ts:150-158`), so the default cannot cause an SMS send in an email-only deployment. Changing them would alter the phone endpoint's contract for the future phase without adding safety.
- `SMS_PRIMARY_PROVIDER` / `SMS_SECONDARY_PROVIDER` in the legacy env template are read by no source file (repo-wide search). Both templates now label them inert so nobody mistakes them for the channel switch.

### Requirement 12 — no paid email service introduced; options and costs documented

No dependency was added, no vendor account was created, and no transport other than the existing Nodemailer SMTP path is used. `SMTP_FROM_NAME` was added as a **new, implemented and documented** variable (`provider.config.ts:295`, `:312`; tests at `otp-channel-policy.spec.ts:154-168`) so the sender can be labelled without a commercial template service. See §6 for the options and their expected costs.

---

## 4. Exact staging environment variables

All names below are read by the codebase today. The only newly introduced name is `SMTP_FROM_NAME`, which is implemented and tested. **No placeholder here is a real credential.**

### 4.1 Required for email OTP delivery

| Variable | Required | Read at | Meaning / staging value |
| --- | --- | --- | --- |
| `SMTP_HOST` | **Yes** | `provider.config.ts:289` | Relay hostname. Without it (or without `SMTP_FROM`) email is "not configured" and a production-like process refuses to boot. |
| `SMTP_FROM` | **Yes** | `provider.config.ts:294` | Envelope/header sender address, e.g. `noreply@<your-domain>`. Must be a sender the relay accepts. |
| `SMTP_PORT` | No (default `587`) | `provider.config.ts:290` | `587` for STARTTLS, `465` for implicit TLS, `1025` for a local Mailhog. |
| `SMTP_SECURE` | No (default `false`) | `provider.config.ts:291` | TLS/security mode. `true` = implicit TLS from the first byte (typically 465). `false` = plaintext upgrade via STARTTLS when offered (typically 587). Passed straight to Nodemailer's `secure` option. **There is no `SMTP_TLS_MODE` variable.** |
| `SMTP_USER` | For an authenticated relay | `provider.config.ts:292` | Relay username. Optional only for an anonymous relay such as Mailhog. |
| `SMTP_PASSWORD` | For an authenticated relay | `provider.config.ts:293` | Relay password or **application password**. Secret — inject from the platform's secret store, never commit. |
| `SMTP_FROM_NAME` | No (default empty) | `provider.config.ts:295` | Sender display name, e.g. `SCS Platform`. Cosmetic; never affects enablement (`otp-channel-policy.spec.ts:165`). |
| `OTP_CHANNELS` | No (default `email`) | `provider.config.ts:27`, `:67-70` | Set `OTP_CHANNELS=email` explicitly for staging so the intent is visible in config review. Comma-separated allowlist; valid names `email`, `sms`, `whatsapp`. A typo or an empty-after-trim value aborts startup in **every** environment. `mock` is never configurable. |
| `FLAG_AUTH_EMAIL_OTP` | **Yes — `true`** | feature-flag gate on the email-OTP and account-linking routes | `.env.example:161` keeps it `false`. If staging leaves it false, every email OTP and account-linking route returns **404** and the clients show "email sign-in not enabled in this environment". This is the single most likely staging misconfiguration. |
| `OTP_HMAC_SECRET` | **Yes** | OTP challenge hashing | Per-challenge-salted HMAC-SHA256 key. Minimum length enforced; use a generated secret of at least 64 characters. Already required before this change. |
| `NODE_ENV` | **Yes** | `otp-delivery-gate.ts:54`, `env-gate.ts:32` | Must be a production-like value for the boot gate to apply. The mock provider is only ever available when `NODE_ENV` is **not** production-like. |
| `OTP_MOCK_ENABLED` | **Must be unset/false in staging** | `otp-delivery-gate.ts:63`, `provider-registry.service.ts:115` | Development convenience only. Even if set to `true`, it cannot count as a delivery path in a production-like process, and the mock provider is not instantiated there. |

Minimum "configured" test is `SMTP_HOST && SMTP_FROM` (`provider.config.ts:299`). Authentication is optional in code because local Mailhog needs none; a real relay will normally require `SMTP_USER` + `SMTP_PASSWORD`, and omitting them produces an auth rejection at send time (`smtp-email.provider.ts:152`), not a boot failure.

### 4.2 Deliberately NOT required (deferred SMS/WhatsApp phase)

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_API_VERSION`. Leaving all of them unset is the expected staging state and produces no readiness problem and no startup failure. Setting them does **not** enable the channels — only `OTP_CHANNELS` does.

### 4.3 Templates updated

- `.env.example:29-43` — SMTP block, minimum-configured rule, TLS semantics, `SMTP_FROM_NAME`.
- `.env.example:62` — commented `# OTP_CHANNELS=email` with the full allowlist semantics.
- `.env.example:110`, `:126` — Twilio block marked deferred; legacy SMS provider names marked inert.
- `.env.example:160-161` — `FLAG_AUTH_EMAIL_OTP=false` retained, with the warning that staging must set `true`.
- `infra/deploy/.env.production.example` §9 — corrected: `SMTP_*` is no longer listed as "not read by the API"; `SMS_PRIMARY_PROVIDER` / `SMS_SECONDARY_PROVIDER` documented as read by nothing.
- `infra/deploy/.env.production.example` §10 — new section with the email-only staging values (placeholders only) and the Compose passthrough warning described in §7.

---

## 5. Configuration steps for staging (owner actions — NOT performed here)

These are instructions for whoever owns the staging environment. Nothing in this list was executed in this session.

1. **Choose the relay** from §6 and obtain its SMTP host, port, TLS mode and credentials. Do not paste credentials into the repository.
2. **Set the API environment** in the hosting platform's secret/config store:
   `NODE_ENV=<production-like>`, `OTP_CHANNELS=email`, `FLAG_AUTH_EMAIL_OTP=true`, `OTP_HMAC_SECRET=<generated ≥64 chars>`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_USER`, `SMTP_PASSWORD`. Leave `OTP_MOCK_ENABLED` unset. Leave all Twilio/WhatsApp variables unset.
3. **If deploying via `infra/docker-compose.prod.yml`, fix the passthrough first.** Its `x-api-environment` block (`:43-90`) forwards none of `SMTP_*`, `OTP_*` or `FLAG_AUTH_EMAIL_OTP`, and already omitted `OTP_HMAC_SECRET`. As committed, that stack cannot serve OTP at all. The exact snippet an operator must add is written into `infra/deploy/.env.production.example` §10. **The compose file was deliberately not edited** — it is P13 deployment configuration and outside this authorization.
4. **Verify the boot log.** A correctly configured process logs `OTP delivery: ready — permitted channels: email` (`main.ts:61-65`) and `SMTP email provider is configured (<host>:<port>, with auth)` (`provider.config.ts:310`). A misconfigured one refuses to boot and prints `[EMAIL_PROVIDER_NOT_CONFIGURED]` naming the missing variables. Neither log line contains a credential value.
5. **Confirm the flag took effect.** `POST /v1/auth/otp/email/request` must not return 404. A 404 means `FLAG_AUTH_EMAIL_OTP` is still false.
6. **Run the staging smoke test** in `docs/reports/OTP-S1.40-STAGING-SMOKE-TEST-PLAN.md` against a mailbox you control, for admin, buyer and merchant accounts. This session sent no real messages, so end-to-end delivery through a real relay is **unverified**.
7. **Migration 0066 remains unapplied** to staging, per the standing restriction. The device-trust schema work is a separate owner decision.

---

## 6. SMTP options and expected costs (requirement 12)

No option below was contracted, configured or paid for. Costs are indicative and must be confirmed against the vendor's current pricing page before any commitment; introducing a paid service requires explicit approval.

| Option | Configuration | Expected cost | Notes |
| --- | --- | --- | --- |
| **Existing institutional/domain mail relay** (recommended first choice) | `SMTP_HOST` = your mail host, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`/`SMTP_PASSWORD` = mailbox or app password, `SMTP_FROM` = an address on that domain | **$0 incremental** if the mailbox/domain is already subscribed | No new vendor, no new dependency. Check the provider's daily sending limit and whether it permits transactional OTP traffic. |
| **Gmail / Google Workspace SMTP with an application password** | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` = the mailbox, `SMTP_PASSWORD` = a 16-character **app password** (requires 2FA on the account), `SMTP_FROM` = that mailbox | **$0 incremental** on an existing Workspace subscription; a new Workspace subscription is a paid seat and needs approval | Consumer Gmail has daily recipient limits and is not designed for transactional auth mail. Acceptable for low-volume staging testing, not for production scale. |
| **Self-hosted catch-all for local/CI testing (Mailhog/Mailpit)** | `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, `SMTP_FROM=noreply@scsp.dev`, no auth | **$0** | This is what `.env.example:31-38` ships. Messages are captured, not delivered. **Not a staging solution** — it cannot prove real delivery. |
| **Internal mock provider** | `OTP_MOCK_ENABLED=true` with a non-production `NODE_ENV` | **$0** | Development/test only. Hard-blocked in production-like environments (`otp-delivery-gate.ts:63`, `provider-registry.service.ts:115`). Never counts toward staging readiness. |
| **Commercial SMTP relay (e.g. Amazon SES, Postmark, SendGrid, Mailgun)** | Same `SMTP_*` variables pointed at the vendor's SMTP endpoint | Amazon SES outbound is publicly listed at roughly **$0.10 per 1,000 messages** with no monthly minimum; other vendors typically charge a monthly plan. Confirm current pricing before committing. | **Requires explicit approval — not introduced.** At staging OTP volumes the per-message cost is negligible, but the account, domain verification (SPF/DKIM) and possible sandbox restrictions are real setup work. |

Cost comparison for the deferred alternative: SMS via Twilio is billed per message segment and per destination country, which is precisely the cost the business decision defers. Email OTP over an existing relay adds no per-message charge.

Sources for the indicative commercial pricing: [Amazon SES pricing](https://aws.amazon.com/ses/pricing/), [Amazon SES pricing overview (Nov 2026)](https://costgoat.com/pricing/amazon-ses). These were consulted for the cost column only; no account was created and no service was configured.

---

## 7. Limitations and verification gaps

These are stated plainly rather than smoothed over.

1. **No real delivery was proven.** Every test mocks the transport. Whether a chosen relay accepts the message, whether SPF/DKIM pass, and whether the mail reaches an inbox are all unverified. Step 6 of §5 is the owner's smoke test.
2. **The mobile app has no email OTP path at all.** `mobile/lib/models/models.dart:1085`, `:1088`, `:1099`, `:1107` parse only `otpPhone`; `mobile/lib/screens/auth/login_screen.dart:34`, `:130-133`, `:414-416` render only a phone prompt; `mobile/lib/services/api_service.dart:74-78` posts `{'phone': phone}` to `/v1/auth/otp/request`. Under `OTP_CHANNELS=email` that request is refused with `SMS_CHANNEL_DISABLED`. **Mobile was not modified** — adding an email OTP flow to Flutter is a separate piece of work. Mobile login is therefore blocked in an email-only staging release until that work lands. This is the most significant functional gap in this changeset.
3. **The phone escape hatch still exists in the web and admin UI.** Web offers "Use phone number instead" and a "Resend via WhatsApp" switch (`apps/web/src/__tests__/auth-login-channel.test.tsx`, 9 passing cases, still exercises SMS↔WhatsApp switching). The server refuses both with `<CHANNEL>_CHANNEL_DISABLED`, and the clients classify that as `unavailable` and show an error without offering a retry (`packages/contracts/src/index.ts:113-121`). So it is a UX dead-end, not a delivery or security hole — but a staging tester can still reach a form that cannot succeed. The tabs were preserved deliberately for requirement 11; hiding them would require the client to know the server's allowlist, which no endpoint currently exposes.
4. **`infra/docker-compose.prod.yml` forwards no OTP/SMTP variables** (`:43-90`). Documented, not fixed — see §5 step 3.
5. **`FLAG_AUTH_EMAIL_OTP` defaults to `false`** in `.env.example:161`. Staging must override it or every email route 404s.
6. **Two pre-existing admin test failures remain.** `apps/admin/src/__tests__/management.test.tsx` fails 2 of its cases ("Complete description" text; a moderation spy assertion). Confirmed unrelated: that file imports only `hooks/useAdminTable`, `lib/management-tables`, `components/DetailDialog`, `components/ManagementPage`, `components/ProductDetails` and `lib/api` — nothing from auth — and no other admin source file outside auth was modified. They were failing before this work and were not "fixed" by weakening assertions.
7. **Real-Redis throttle isolation was not run.** `throttle-ip-isolation.spec.ts` skipped its 3 cases because no disposable Redis was provisioned. Requirement 9's per-IP throttling evidence therefore rests on the Postgres-backed suites and the unit tests, not on that file.
8. **No hosted CI run is claimed.** All evidence below is local. Hosted verification on the pushed SHA is a separate step and has not been performed.
9. **Migration 0066 is unapplied** to staging, and no Render/Supabase/Twilio/SMTP setting was changed anywhere.

---

## 8. Test evidence (executed locally)

All runs were executed in this session against the working tree. Exit codes are read from the `vitest_exit=` / `tsc_exit=` line written into each log, not from the background wrapper's exit status.

### 8.1 New test files

| File | Cases | Proves |
| --- | --- | --- |
| `apps/api/src/__tests__/unit/notifications/otp-channel-policy.spec.ts` | 24 | Allowlist default, parsing, unknown-name rejection, permission ≠ credentials, `SMTP_FROM_NAME`, actionable readiness, no credential leakage |
| `apps/api/src/__tests__/unit/notifications/otp-boot-readiness.spec.ts` | 10 | Boots with email and no SMS credential; refuses a deployed process that cannot deliver; no-op in dev/test; malformed allowlist fails fast everywhere; mock never counts in staging |
| `apps/api/src/__tests__/unit/notifications/otp-email-only-routing.spec.ts` | 17 | Real registry + router + providers, `NODE_ENV=production`, only `nodemailer` mocked: email accepted; SMS/WhatsApp spies never called even with credentials present; disabled ≠ unconfigured; no fallback on rejection, auth failure, timeout or missing provider; explicit re-enable works |
| `apps/web/src/__tests__/login-email-only.test.tsx` | 9 | Email is the primary web channel; passwordless entry requests email; email second factor renders and verifies through the email endpoint; no delivery claim when unconfirmed; fail-closed on missing `otpDelivery`; phone factor still works; Phone OTP tab sends nothing on open |
| `apps/web/src/__tests__/auth-lib-second-factor.test.ts` | 5 | `loginPassword` carries `otpEmail`/`otpDelivery`, invents neither a phone nor a delivery answer |
| `apps/admin/src/__tests__/auth-login-email-otp.test.tsx` | 15 | Admin requests email by default and never the phone route; honest copy for accepted/rejected/uncertain/unconfigured/disabled; verify with device trust + `/v1/me` role hydration; 429 and 404 mapping |
| `apps/admin/src/__tests__/auth-login-second-factor-email.test.tsx` | 7 | Admin lib carries `otpEmail`; page renders the email code-entry form (no phone field, no "sent to your phone"); verify posts to the email endpoint; uncertain wording; fail-closed; phone factor still works end to end |

### 8.2 Modified test files

- `apps/api/src/__tests__/unit/notifications/{otp-delivery-providers,otp-delivery-timeout}.spec.ts` — Twilio and WhatsApp fixtures now supply `credentialsPresent: true`, because these provider-level cases are about credentialed behaviour and the type now has two axes. **No assertion changed.**
- `apps/api/src/__tests__/unit/notifications/{provider-registry,smtp-provider}.spec.ts` — extended for permission and `SMTP_FROM_NAME`.
- `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` — added the 6-case *"Second factor channel selection (email-only release)"* group.
- `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts` — the stub registry predated the permission axis and raised `TypeError: this.providerRegistry.isChannelPermitted is not a function` in 8 cases. Added `isChannelPermitted: vi.fn().mockReturnValue(true)` to the fixture, with an in-code comment explaining that every case in that file describes an all-permitted release and that channel choice is proven in `password-login-regression`. **No assertion changed.**
- `apps/web/src/__tests__/{otp-delivery-classifier,account-linking}.test.tsx`, `apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx` — updated for the `_CHANNEL_DISABLED` → `unavailable` classification and the email-first admin flow.

### 8.3 Suite results

| Suite | Result | Log |
| --- | --- | --- |
| API full unit | **130 files passed, 2608 tests passed**, `vitest_exit=0` | `.m73b6-scratch/final-api-unit.txt` |
| API notifications unit (focused) | **10 files passed, 166 tests passed**, `vitest_exit=0` | `.m73b6-scratch/notifications-green-2.txt` |
| API identity unit (focused) | **19 files passed, 321 tests passed**, `vitest_exit=0` | `.m73b6-scratch/req9-identity-unit.txt` |
| API OTP integration, combined 8-file run | **7 files passed, 1 skipped; 142 tests passed, 3 skipped**, `vitest_exit=0` | `.m73b6-scratch/req9-integration-final.txt` |
| Web full suite | **9 files passed, 91 tests passed**, `vitest_exit=0` | `.m73b6-scratch/final-web.txt` |
| Admin full suite | **4 files passed, 1 failed; 59 passed, 2 failed**, `vitest_exit=1` — both failures pre-existing in `management.test.tsx` (§7.6) | `.m73b6-scratch/final-admin.txt` |
| Admin auth-focused (3 files) | **3 files passed, 38 tests passed**, `vitest_exit=0` | `.m73b6-scratch/admin-sf-green.txt` |
| API typecheck | `tsc_exit=0` | `.m73b6-scratch/api-typecheck-2.txt` |
| Web typecheck | `tsc_exit=0` | `.m73b6-scratch/web-typecheck.txt` |
| Admin typecheck | `tsc_exit=0` | `.m73b6-scratch/admin-typecheck.txt` |
| API build (`nest build`) | **0 TS issues, 439 files compiled**, `build_exit=0` | `.m73b6-scratch/final-api-build.txt` |
| API lint | **0 errors, 313 warnings** (all pre-existing unused-var warnings), `lint_exit=0` | `.m73b6-scratch/final-api-lint.txt` |
| Web lint | Warnings only (pre-existing `react-hooks/exhaustive-deps`), `lint_exit=0` | `.m73b6-scratch/final-web-lint.txt` |
| Admin lint | **No ESLint warnings or errors**, `lint_exit=0` | `.m73b6-scratch/final-admin-lint.txt` |

The combined integration run covered `email-otp-e2e`, `email-otp-security`, `phone-otp-regression`, `password-login-regression`, `device-trust-lifecycle`, `account-linking`, `registration-flows` (all Postgres testcontainers, `postgres:16-alpine`) and `throttle-ip-isolation` (skipped, §7.7).

### 8.4 TDD record

Each behaviour change was written test-first and the failure was observed before implementation:

- Web second factor: RED logged in `.m73b6-scratch/web-lib-red.txt` / `web-emailonly-red.txt`, GREEN in `web-green-1.txt`.
- Admin second factor: RED `Tests 5 failed | 2 passed (7)` in `.m73b6-scratch/admin-sf-red.txt` (missing `otpEmail` in the lib result; missing email code-entry copy; `expected +0 to be 1` for the email verify call), GREEN `38 passed` in `admin-sf-green.txt`.
- The device-trust regression was diagnosed from the actual `TypeError` and repaired at the fixture, not by relaxing an assertion.

### 8.5 Reproducing this evidence

The `.m73b6-scratch/*.txt` paths above are **local session artifacts and are not committed**. They are cited so the runs can be traced in this session; the durable evidence is the test code itself. To regenerate, from the repository root:

```bash
pnpm --filter @scs/contracts build                   # web/admin resolve the classifier from dist/
pnpm --filter @scs/api test:unit                     # 130 files / 2608 tests
pnpm --filter @scs/api exec vitest run \
  src/__tests__/unit/notifications                   # channel policy, boot gate, routing
pnpm --filter @scs/api exec vitest run --no-file-parallelism \
  src/__tests__/integration/email-otp-e2e.postgres.spec.ts \
  src/__tests__/integration/email-otp-security.postgres.spec.ts \
  src/__tests__/integration/password-login-regression.postgres.spec.ts \
  src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts \
  src/__tests__/integration/account-linking.postgres.spec.ts \
  src/__tests__/integration/registration-flows.postgres.spec.ts \
  src/__tests__/integration/phone-otp-regression.postgres.spec.ts \
  src/__tests__/integration/throttle-ip-isolation.spec.ts   # needs Docker; Redis file skips
pnpm --filter @scs/web test
pnpm --filter @scs/admin test
pnpm --filter @scs/api typecheck && pnpm --filter @scs/web typecheck && pnpm --filter @scs/admin typecheck
pnpm --filter @scs/api build
pnpm --filter @scs/api lint && pnpm --filter @scs/web lint && pnpm --filter @scs/admin lint
```

The Postgres suites use `@testcontainers/postgresql` (`postgres:16-alpine`) and require a running Docker daemon. `@scs/contracts` must be built before the web/admin suites, because they resolve the classifier from its `dist/`. The real-Redis file additionally needs `REDIS_IT=1`, `REDIS_URL` and `REDIS_DISPOSABLE_ACK=1`; without them it skips, which is the gap recorded in §7.7.

---

## 9. Future SMS activation procedure

When the business approves SMS spend, activation is configuration plus verification — the implementation is already present and tested.

1. **Obtain approval** for the SMS provider and its per-message cost. This is a business decision, not an engineering one.
2. **Provision Twilio**: account SID, auth token, and a sending number capable of reaching the target countries. Store them as secrets.
3. **Set the allowlist**: `OTP_CHANNELS=email,sms` (add `whatsapp` only if that channel is also approved and credentialed). Order is preserved but does not imply priority; the second-factor selection keeps phone precedence when SMS is genuinely usable (`identity.service.ts:1973-1983`).
4. **Expect a new readiness gate**: once `sms` is permitted, missing Twilio credentials *do* raise `SMS_PROVIDER_NOT_CONFIGURED` (`provider.config.ts:382-389`), and a production-like process with no deliverable channel refuses to boot. This is intended.
5. **Verify before announcing**: run `otp-email-only-routing.spec.ts:192` (*"can be explicitly re-enabled for the future SMS phase"*) and `password-login-regression.postgres.spec.ts` (*"keeps the phone second factor when a later phase re-enables SMS"*), then the phone integration suite, then a real send to a controlled number in a non-production environment.
6. **Clients need no change for the web/admin phone path** — it was preserved. **Mobile still needs its email OTP work** (§7.2) regardless of the SMS decision.
7. **WhatsApp** follows the same shape with `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`. Note `WHATSAPP_API_VERSION` warns and falls back to `v18.0` when malformed.
8. **There is still no cross-channel fallback.** Enabling SMS does not make it a backup for failed email; each request produces at most one send (`otp-delivery.service.ts:17`). If a fallback policy is ever wanted, it must be designed and tested explicitly.

---

## 10. Readiness verdict by dimension

| Dimension | Verdict | Basis |
| --- | --- | --- |
| Channel policy implemented | **Ready** | §2, §3 req 1–5; 51 new API unit cases plus the real-provider routing spec |
| Honest delivery reporting | **Ready** | §3 req 7–8; classifier + web/admin suites green |
| OTP security preserved | **Ready, with one gap** | 142 integration cases passed; real-Redis throttle isolation skipped (§7.7) |
| Admin / web buyer / merchant consistency | **Ready** | Single web login shared with merchant; admin email-first and channel-aware second factor |
| Mobile | **Not ready** | No email OTP path exists (§7.2) |
| Staging environment configuration | **Not ready — owner action required** | Nothing was configured; `FLAG_AUTH_EMAIL_OTP`, SMTP secrets and the Compose passthrough are outstanding (§5, §7.4–7.5) |
| Real delivery through a relay | **Unverified** | No real message sent (§7.1) |
| Hosted CI on the pushed SHA | **Not verified** | Local evidence only (§7.8) |
| Deployment | **Not authorized, not performed** | §1 |

**Bottom line:** the code is ready for an email-only staging release; the environment is not, and mobile is not. This report does not claim the branch is staging-ready on the strength of local tests.

---

## 11. Delivery

- Implementation and this report were committed together as **`3c246e70dfb3d6e33fd069d812e44ce69a0ee8f6`** on `feature/otp-auth-security-hardening` and pushed to `origin` (32 files, +3305/−89).
- All verification in §8 was executed against the working tree whose staged content became that commit. No source file changed between the test runs and the commit.
- Unrelated working-tree changes (the `returns` services and the P13 production documents) were deliberately left unstaged and uncommitted.
- No merge, no deploy, no PR action, no environment configuration, no migration application. Hosted CI on `3c246e7` has not been observed and is not claimed.