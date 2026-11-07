/**
 * Client-side channel availability for the login UI.
 *
 * The initial email-only staging release hides every USER-INITIATED
 * phone/SMS/WhatsApp selection (the Phone OTP tab, the delivery-channel radios,
 * the channel-switch resend buttons and the phone footer). The server's
 * `OTP_CHANNELS` allowlist remains the final authority: it refuses a
 * non-permitted channel before touching any provider, so this flag only controls
 * what the client offers — it never overrides the server.
 *
 * Flipping this to `true` is part of the separately approved future SMS phase and
 * requires no other code change: all phone branches, handlers and state are
 * preserved behind it. Server-issued phone challenges (a second factor the API
 * itself chose) still render and verify regardless of this flag, so a user is
 * never trapped by it.
 */
export const PHONE_OTP_UI_ENABLED = false;