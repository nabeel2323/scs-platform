import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/device_id_service.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';

/// Login screen with dual authentication (Email/Password + Phone OTP)
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();

  bool _isLoading = false;
  String? _error;
  bool _obscurePassword = true;
  String? _otpPhone;
  bool _otpSent = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _checkAutoLogin();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _checkAutoLogin() async {
    final prefs = await SharedPreferences.getInstance();
    final lastEmail = prefs.getString('scs_last_email');
    if (lastEmail == null || lastEmail.isEmpty) return;

    final deviceId = await DeviceIdService.instance.getDeviceId();
    try {
      final api = ref.read(apiServiceProvider);
      final result = await api.checkDeviceLogin(lastEmail, deviceId);

      if (result['canAutoLogin'] == true) {
        _emailController.text = lastEmail;
        // User will need to enter password
      }
    } catch (e) {
      // Ignore errors
    }
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

      if (result['requiresOtp'] == true) {
        // Device not trusted - require OTP
        setState(() {
          _otpPhone = result['otpPhone'];
          _otpSent = true;
          _tabController.index = 1; // Switch to OTP tab
          _error = 'New device detected. Please verify with OTP.';
          _isLoading = false;
        });
        return;
      }

      // Login successful
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('scs_last_email', _emailController.text);

      if (mounted) {
        context.go('/dashboard');
      }
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
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
      await api.requestOtp(_phoneController.text);
      setState(() {
        _otpSent = true;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
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
      await api.verifyOtp(_phoneController.text, _otpController.text);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('scs_last_email', _emailController.text);

      if (mounted) {
        context.go('/dashboard');
      }
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll('Exception: ', '');
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
                tabs: const [
                  Tab(text: 'Email/Password'),
                  Tab(text: 'Phone OTP'),
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
                    _buildOtpLoginForm(),
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
          onPressed: () => _tabController.index = 1,
          child: const Text('Login with Phone OTP instead'),
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
            'Enter OTP sent to ${_otpPhone ?? _phoneController.text}',
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
      ],
    );
  }
}
