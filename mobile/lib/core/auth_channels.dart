import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the login UI may *offer* the phone OTP channel (SMS / WhatsApp).
///
/// The initial staging release permits email OTP only. The backend's
/// `OTP_CHANNELS` allowlist is the final authority: a channel is enabled only
/// when it is both permitted and configured, and the delivery router refuses a
/// non-permitted channel before it touches any provider
/// (`<CHANNEL>_CHANNEL_DISABLED`). This flag does not grant permission — it only
/// removes the user-facing affordance that would invite somebody to select a
/// channel this release cannot deliver to, which is how a disabled channel
/// becomes a dead end.
///
/// Two consequences worth keeping straight:
///
///  * The SMS/WhatsApp implementation stays in the app for a separately
///    approved future phase. Setting this to `true` re-exposes the UI; it does
///    not enable anything server-side.
///  * A challenge the *server* issued on the phone channel is still rendered
///    regardless of this flag. Hiding it would trap a user mid-login, and the
///    server — not the client — decides which channel carries a second factor.
///
/// A Riverpod provider rather than a `const` so widget tests can override it and
/// keep exercising the dormant phone path.
final phoneOtpUiEnabledProvider = Provider<bool>((ref) => false);