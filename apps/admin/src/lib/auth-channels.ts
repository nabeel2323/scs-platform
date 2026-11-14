/**
 * Client-side channel visibility for the initial EMAIL-ONLY staging release.
 *
 * The backend's `OTP_CHANNELS` allowlist (default `email`) is the final
 * authority: the delivery router refuses a non-permitted channel with
 * `SMS_CHANNEL_DISABLED` before touching any provider, and there is no
 * cross-channel fallback. This constant only controls whether the UI offers
 * USER-INITIATED phone/SMS selection (the "Use phone number instead" choice
 * and the phone re-send escape hatch). Server-issued challenges are exempt:
 * if the API itself returns `otpPhone` for the password second factor, the
 * phone verify step must still render and work, or the admin is trapped.
 *
 * Flipping this to `true` belongs to the separately approved future SMS phase
 * and needs no other code change — the phone implementation (forms, handlers,
 * state) is preserved behind it. Deliberately NOT an environment variable:
 * the server allowlist, not client configuration, decides what can deliver.
 */
export const PHONE_OTP_UI_ENABLED = false;