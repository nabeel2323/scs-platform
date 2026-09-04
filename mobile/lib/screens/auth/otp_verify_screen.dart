import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/providers.dart';

class OtpVerifyScreen extends ConsumerStatefulWidget {
  final String phone;
  const OtpVerifyScreen({super.key, required this.phone});
  @override
  ConsumerState<OtpVerifyScreen> createState() => _OtpVerifyScreenState();
}

class _OtpVerifyScreenState extends ConsumerState<OtpVerifyScreen> {
  final _otpCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _verify() async {
    if (_otpCtrl.text.length < 4) {
      setState(() => _error = 'Enter the OTP code');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ref
          .read(apiServiceProvider)
          .verifyOtp(widget.phone, _otpCtrl.text);
      final accessToken = data['accessToken'] as String;
      final refreshToken = data['refreshToken'] as String;
      await ref
          .read(authStorageProvider)
          .saveTokens(accessToken: accessToken, refreshToken: refreshToken);
      ref.read(apiClientProvider).setAccessToken(accessToken);
      ref.read(isAuthenticatedProvider.notifier).state = true;
      ref.read(currentUserPhoneProvider.notifier).state = widget.phone;
      // Initialize push notifications after successful login
      ref.read(pushNotificationServiceProvider).initialize();
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() => _error = 'Invalid OTP. Please try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _otpCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(title: const Text('Verify OTP')),
        body: SafeArea(
            child: Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                    child: SingleChildScrollView(
                        child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                      const Icon(Icons.security, size: 56),
                      const SizedBox(height: 16),
                      Text('Enter the code sent to',
                          style: Theme.of(context).textTheme.bodyLarge),
                      Text(widget.phone,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 18)),
                      const SizedBox(height: 32),
                      TextField(
                          controller: _otpCtrl,
                          keyboardType: TextInputType.number,
                          textAlign: TextAlign.center,
                          maxLength: 6,
                          style: const TextStyle(
                              fontSize: 24,
                              letterSpacing: 8,
                              fontWeight: FontWeight.w700),
                          decoration: InputDecoration(
                              hintText: '------',
                              border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10)),
                              errorText: _error,
                              counterStyle:
                                  const TextStyle(color: Colors.transparent))),
                      const SizedBox(height: 16),
                      SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton(
                              onPressed: _loading ? null : _verify,
                              child: _loading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2))
                                  : const Text('Verify'))),
                      TextButton(
                          onPressed: () => context.go('/login'),
                          child: const Text('Change phone number')),
                    ]))))));
  }
}
