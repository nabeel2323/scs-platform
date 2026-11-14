import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_core/mobile_core.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/device_id_service.dart';
import '../../services/api_service.dart';
import '../../core/theme.dart';
import '../../core/auth_channels.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';

/// Login screen with dual authentication (Email/Password + Phone OTP)
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    // Not SingleTickerProviderStateMixin: mounting the phone tab for a
    // server-issued challenge creates a second TabController (the first is
    // disposed after the frame), and the single-ticker mixin asserts on a
    // second Ticker even when the first is on its way out.
    with TickerProviderStateMixin {
  late TabController _tabController;
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  // Email OTP state (S1.38 Flutter integration)
  final _emailOtpEmailController = TextEditingController();
  final _emailOtpCodeController = TextEditingController();

  bool _isLoading = false;
  String? _error;
  bool _obscurePassword = true;
  String? _otpPhone;
  bool _otpSent = false;
  bool _emailOtpSent = false;

  /// Whether the Phone OTP tab is mounted. Starts from the release's UI policy
  /// ([phoneOtpUiEnabledProvider]) and is forced on when the SERVER issues a
  /// phone challenge: the allowlist is server-side, and hiding a challenge that
  /// has already been sent would trap the user mid-login.
  bool _showPhoneTab = false;

  /// True when the API could not confirm that a code was delivered. The
  /// code-entry step then says "if a code arrived" instead of "OTP sent",
  /// because promising delivery we do not know about is how a failed provider
  /// looks like a working one.
  bool _otpUncertain = false;
  bool _emailOtpUncertain = false;

  @override
  void initState() {
    super.initState();
    _showPhoneTab = ref.read(phoneOtpUiEnabledProvider);
    _tabController =
        TabController(length: _showPhoneTab ? 3 : 2, vsync: this);
    // No device-trust pre-flight here any more. It queried an unauthenticated
    // endpoint about whether this address has a password and whether this
    // device had been trusted before — the disclosure finding S-2 removed. The
    // password request itself now answers all of it, server-side.
    _prefillLastEmail();
  }

  Future<void> _prefillLastEmail() async {
    final prefs = await SharedPreferences.getInstance();
    final lastEmail = prefs.getString('scs_last_email');
    if (lastEmail == null || lastEmail.isEmpty || !mounted) return;
    _emailController.text = lastEmail;
  }

  /// Index of the Email OTP tab, which shifts left when the phone tab is absent.
  /// Hard-coded indices are how a hidden tab turns into a dead end.
  int get _emailOtpTabIndex => _showPhoneTab ? 2 : 1;

  /// Replaces the tab controller when the number of tabs changes.
  ///
  /// `TabController.length` is final, so mounting the phone tab for a
  /// server-issued challenge needs a new controller. The previous one is
  /// disposed AFTER the frame: TabBar and TabBarView detach from it during
  /// `didUpdateWidget`, and disposing it first would pull the animation out
  /// from under widgets that still hold a reference.
  void _resizeTabs(int length, {int initialIndex = 0}) {
    final previous = _tabController;
    _tabController =
        TabController(length: length, vsync: this, initialIndex: initialIndex);
    WidgetsBinding.instance.addPostFrameCallback((_) => previous.dispose());
  }

  /// A pragmatic address check, not an RFC 5322 parser: one `@`, no whitespace,
  /// and a dot in the domain. The API's `EmailOtpRequestDto` is the authority
  /// (`@IsEmail()`, max 254); this only stops obviously unusable input from
  /// spending a throttled request.
  static final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  @override
  void dispose() {
    _tabController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _phoneController.dispose();
    _otpController.dispose();
    _emailOtpEmailController.dispose();
    _emailOtpCodeController.dispose();
    super.dispose();
  }

  /// Persist tokens + auth state after a successful login, then enter the app.
  /// Shared by all auth methods so they behave identically; without this the
  /// router redirect bounces straight back to /login.
  ///
  /// `phone` and `email` are the login identifier captured for display before
  /// the profile fetch completes. They must not be conflated: an email-only
  /// account must never populate [currentUserPhoneProvider] with an empty
  /// placeholder (S1.38.1 fix — previously email OTP and password login both
  /// passed `''` as the phone, which made `home_screen` show an empty line and
  /// risked mislabeling the identity model).
  Future<void> _completeLogin(
    AuthTokens tokens, {
    String? phone,
    String? email,
  }) async {
    await ref.read(authStorageProvider).saveTokens(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: DateTime.now().add(AuthStorage.tokenLifetime));
    ref.read(apiClientProvider).setAccessToken(tokens.accessToken);
    ref.read(isAuthenticatedProvider.notifier).state = true;
    ref.read(currentUserPhoneProvider.notifier).state = phone ?? '';
    ref.read(currentUserEmailProvider.notifier).state =
        (email != null && email.isNotEmpty) ? email : null;
    ref.read(pushNotificationServiceProvider).initialize();
    if (mounted) context.go('/home');
  }

  Future<void> _handlePasswordLogin() async {
    if (_emailController.text.isEmpty || _passwordController.text.isEmpty) {
      setState(() => _error = 'Please enter email and password');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = ref.read(apiServiceProvider);
      final deviceId = await DeviceIdService.instance.getDeviceId();
      final deviceInfo = await DeviceIdService.instance.getDeviceInfo();

      final result = await api.loginPassword(
        _emailController.text,
        _passwordController.text,
        deviceId,
        deviceInfo,
      );

      if (result.requiresOtp) {
        // The server chose the channel from its own allowlist. Read which one
        // it used rather than assuming phone: in the email-only release even a
        // dual-identifier account is challenged by email, and steering the user
        // to a phone step would be a dead end.
        if (result.hasEmailChallenge) {
          setState(() {
            // `otpEmail` is MASKED by the API and is for display only. The
            // verify endpoint takes the address from the request body, so code
            // entry keeps the address the user actually authenticated with.
            _emailOtpEmailController.text = _emailController.text.trim();
            _emailOtpCodeController.clear();
            _emailOtpSent = true;
            _emailOtpUncertain = !result.otpConfirmed;
            _tabController.index = _emailOtpTabIndex;
            _error = result.otpConfirmed
                ? 'New device detected. Enter the code sent to '
                    '${result.otpEmail}.'
                : 'This device needs a second factor. We couldn\'t confirm the '
                    'code was delivered to ${result.otpEmail}, but you can '
                    'enter it if it arrives.';
            _isLoading = false;
          });
          return;
        }

        // A phone challenge the server issued itself. The tab is hidden by the
        // release's UI policy, so mount it for this challenge only — the code
        // has already been sent and the user must be able to answer it.
        final otpPhone = result.otpPhone ?? '';
        setState(() {
          if (!_showPhoneTab) {
            _showPhoneTab = true;
            _resizeTabs(3, initialIndex: 1);
          }
          _otpPhone = otpPhone;
          _phoneController.text = otpPhone;
          _otpSent = true;
          // The server requested this challenge itself and reports how
          // confidently it went out, so mirror that instead of assuming.
          _otpUncertain = !result.otpConfirmed;
          _tabController.index = 1; // Switch to OTP tab
          _error = result.otpConfirmed
              ? 'New device detected. Please verify with OTP.'
              : 'This device needs a second factor. We couldn\'t confirm the '
                  'code was delivered, but you can enter it if it arrives.';
          _isLoading = false;
        });
        return;
      }

      // Login successful — persist the session and enter the app.
      final tokens = result.toAuthTokens();
      if (tokens == null) {
        setState(() {
          _error = 'Login failed: no session was returned.';
          _isLoading = false;
        });
        return;
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('scs_last_email', _emailController.text);
      await _completeLogin(tokens, email: _emailController.text);
    } catch (e) {
      setState(() {
        _error = ApiService.errorMessage(e);
        _isLoading = false;
      });
    }
  }

  Future<void> _handleRequestOtp() async {
    if (_phoneController.text.isEmpty) {
      setState(() => _error = 'Please enter phone number');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.requestOtp(_phoneController.text);
      // A 2xx is not a delivery: read what the provider said. Only an accepted
      // send may be presented as "OTP sent".
      setState(() {
        _isLoading = false;
        _otpUncertain = false;
        switch (result.outcome) {
          case 'accepted':
            _otpSent = true;
            _error = null;
            break;
          case 'uncertain':
            // The challenge exists and may still arrive, so code entry is
            // offered — with wording that does not claim a send.
            _otpSent = true;
            _otpUncertain = true;
            _error = null;
            break;
          case 'unavailable':
            _otpSent = false;
            _error =
                'SMS delivery isn\'t available in this environment, so no code was sent. '
                'Sign in with email and password, or try the email option.';
            break;
          default:
            _otpSent = false;
            _error = 'The code couldn\'t be sent. Check the number and try again.';
        }
      });
    } catch (e) {
      setState(() {
        _error = ApiService.errorMessage(e);
        _isLoading = false;
      });
    }
  }

  Future<void> _handleVerifyOtp() async {
    if (_otpController.text.isEmpty) {
      setState(() => _error = 'Please enter OTP');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final api = ref.read(apiServiceProvider);
      final data =
          await api.verifyOtp(_phoneController.text, _otpController.text);

      if (_emailController.text.isNotEmpty) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('scs_last_email', _emailController.text);
      }

      await _completeLogin(
        data,
        phone: _phoneController.text,
        email: _emailController.text.isNotEmpty ? _emailController.text : null,
      );
    } catch (e) {
      setState(() {
        _error = ApiService.errorMessage(e);
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 48),
              Text(
                'Smart Commerce',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: TaifTokens.brandPrimary,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Sign in to continue',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: TaifTokens.muted,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              TabBar(
                controller: _tabController,
                tabs: [
                  const Tab(text: 'Email/Password'),
                  if (_showPhoneTab) const Tab(text: 'Phone OTP'),
                  const Tab(text: 'Email OTP'),
                ],
              ),
              const SizedBox(height: 24),
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    border: Border.all(color: Colors.red.shade200),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _error!,
                    style: TextStyle(color: Colors.red.shade700),
                  ),
                ),
              const SizedBox(height: 16),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildPasswordLoginForm(),
                    if (_showPhoneTab) _buildOtpLoginForm(),
                    _buildEmailOtpLoginForm(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPasswordLoginForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: 'Email',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.email),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          decoration: InputDecoration(
            labelText: 'Password',
            border: const OutlineInputBorder(),
            prefixIcon: const Icon(Icons.lock),
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility : Icons.visibility_off,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
          ),
        ),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _isLoading ? null : _handlePasswordLogin,
          style: ElevatedButton.styleFrom(
            backgroundColor: TaifTokens.brandPrimary,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          child: _isLoading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Text('Login', style: TextStyle(fontSize: 16)),
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => _tabController.index = _emailOtpTabIndex,
          child: const Text('Login with Email OTP instead'),
        ),
      ],
    );
  }

  Widget _buildOtpLoginForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!_otpSent) ...[
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone Number',
              hintText: '+971501234567',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.phone),
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _isLoading ? null : _handleRequestOtp,
            style: ElevatedButton.styleFrom(
              backgroundColor: TaifTokens.brandPrimary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Text('Send OTP', style: TextStyle(fontSize: 16)),
          ),
        ] else ...[
          Text(
            _otpUncertain
                ? 'If a code arrived for ${_otpPhone ?? _phoneController.text},'
                    ' enter it below.'
                : 'Enter OTP sent to ${_otpPhone ?? _phoneController.text}',
            style: Theme.of(context).textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _otpController,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24, letterSpacing: 8),
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              counterText: '',
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _isLoading ? null : _handleVerifyOtp,
            style: ElevatedButton.styleFrom(
              backgroundColor: TaifTokens.brandPrimary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Text('Verify OTP', style: TextStyle(fontSize: 16)),
          ),
          TextButton(
            onPressed: () => setState(() {
              _otpSent = false;
              _otpUncertain = false;
              _otpController.clear();
            }),
            child: const Text('Change phone number'),
          ),
        ],
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => _tabController.index = 0,
          child: const Text('Login with Email/Password instead'),
        ),
        TextButton(
          onPressed: () => _tabController.index = _emailOtpTabIndex,
          child: const Text('Login with Email OTP instead'),
        ),
      ],
    );
  }

  // ── Email OTP login (S1.38 Flutter integration) ──

  Future<void> _handleRequestEmailOtp() async {
    final email = _emailOtpEmailController.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Please enter your email address');
      return;
    }
    // Validate before spending a throttled request on an address the API's
    // `@IsEmail()` guard would reject anyway.
    if (!_emailPattern.hasMatch(email)) {
      setState(() => _error = 'Please enter a valid email address');
      return;
    }
    // Normalise the field so the confirmation copy and the verify request both
    // use the trimmed address rather than whatever whitespace was pasted in.
    _emailOtpEmailController.text = email;
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.requestEmailOtp(email);
      // Same rule as the phone tab: the HTTP status only says the API took the
      // request. Whether a code left the building comes from the delivery fields.
      setState(() {
        _isLoading = false;
        _emailOtpUncertain = false;
        switch (result.outcome) {
          case 'accepted':
            _emailOtpSent = true;
            _error = null;
            break;
          case 'uncertain':
            _emailOtpSent = true;
            _emailOtpUncertain = true;
            _error = null;
            break;
          case 'unavailable':
            _emailOtpSent = false;
            // Covers both EMAIL_PROVIDER_NOT_CONFIGURED and the allowlist's
            // EMAIL_CHANNEL_DISABLED. Neither is the user's address being
            // wrong, and neither may be answered by offering a disabled
            // channel as a fallback.
            _error =
                'Email delivery isn\'t available in this environment, so no code was sent. '
                'Sign in with your password instead, or contact support.';
            break;
          default:
            _emailOtpSent = false;
            _error =
                'The code couldn\'t be sent. Check the address and try again.';
        }
      });
    } catch (e) {
      setState(() {
        _error = ApiService.errorMessage(e);
        _isLoading = false;
      });
    }
  }

  Future<void> _handleVerifyEmailOtp() async {
    if (_emailOtpCodeController.text.isEmpty) {
      setState(() => _error = 'Please enter the OTP code');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiServiceProvider);
      final tokens = await api.verifyEmailOtp(
        _emailOtpEmailController.text,
        _emailOtpCodeController.text,
      );
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('scs_last_email', _emailOtpEmailController.text);
      await _completeLogin(tokens, email: _emailOtpEmailController.text);
    } catch (e) {
      setState(() {
        _error = ApiService.errorMessage(e);
        _isLoading = false;
      });
    }
  }

  Widget _buildEmailOtpLoginForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!_emailOtpSent) ...[
          TextField(
            controller: _emailOtpEmailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email address',
              hintText: 'you@example.com',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.email),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'We\'ll send a 6-digit code to your email. Sign in or create an account instantly.',
            style: TextStyle(fontSize: 13, color: TaifTokens.muted),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _isLoading ? null : _handleRequestEmailOtp,
            style: ElevatedButton.styleFrom(
              backgroundColor: TaifTokens.brandPrimary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor:
                            AlwaysStoppedAnimation<Color>(Colors.white)))
                : const Text('Send code to email',
                    style: TextStyle(fontSize: 16)),
          ),
        ] else ...[
          Text(
            _emailOtpUncertain
                ? 'If a code arrived for ${_emailOtpEmailController.text},'
                    ' enter it below.'
                : 'Code sent to ${_emailOtpEmailController.text}',
            style: Theme.of(context).textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _emailOtpCodeController,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24, letterSpacing: 8),
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              counterText: '',
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _isLoading ? null : _handleVerifyEmailOtp,
            style: ElevatedButton.styleFrom(
              backgroundColor: TaifTokens.brandPrimary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor:
                            AlwaysStoppedAnimation<Color>(Colors.white)))
                : const Text('Verify', style: TextStyle(fontSize: 16)),
          ),
          // Resend goes back through the same request endpoint, so the server's
          // existing `otp-request` throttle applies unchanged — a 429 surfaces
          // as the rate-limit message and leaves code entry in place. No client
          // side cooldown is invented, and no second channel is tried.
          TextButton(
            onPressed: _isLoading ? null : _handleRequestEmailOtp,
            child: const Text('Resend code'),
          ),
          TextButton(
            onPressed: () => setState(() {
              _emailOtpSent = false;
              _emailOtpUncertain = false;
              _emailOtpCodeController.clear();
            }),
            child: const Text('Change email'),
          ),
        ],
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => _tabController.index = 0,
          child: const Text('Login with Email/Password instead'),
        ),
        if (_showPhoneTab)
          TextButton(
            onPressed: () => _tabController.index = 1,
            child: const Text('Login with Phone OTP instead'),
          ),
      ],
    );
  }
}
