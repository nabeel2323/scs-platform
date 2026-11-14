import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

/// What a code-request reply means for the link dialogs.
///
/// An HTTP 200 only says the API accepted the request; the delivery fields say
/// whether a code actually left. `advance` = show the code box, `uncertain` =
/// show it but word the heading as "if a code arrived" rather than claiming a
/// send we cannot confirm, `message` = what to tell the user instead of
/// advancing.
({bool advance, bool uncertain, String? message}) _otpSendOutcome(
    OtpRequestResponse result,
    {required String channel,
    required String target}) {
  switch (result.outcome) {
    case 'accepted':
      return (advance: true, uncertain: false, message: null);
    case 'uncertain':
      return (advance: true, uncertain: true, message: null);
    case 'unavailable':
      return (
        advance: false,
        uncertain: false,
        message:
            "$channel delivery isn't configured in this environment, so no code was sent.",
      );
    default:
      return (
        advance: false,
        uncertain: false,
        message: "The code couldn't be sent. Check the $target and try again.",
      );
  }
}

class ProfileScreen extends ConsumerStatefulWidget {
  /// When embedded as the merchant console's Account tab, the "Merchant
  /// Dashboard" entry is hidden so it cannot recursively push the shell it is
  /// already inside.
  const ProfileScreen({super.key, this.hideMerchantEntry = false});
  final bool hideMerchantEntry;
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _editing = false;
  late TextEditingController _nameCtrl;
  late TextEditingController _emailCtrl;
  // Shared by the two link dialogs (only one can be open at a time). They are
  // State-owned so they are disposed with the screen rather than while a popped
  // dialog is still animating out (S1.38.2).
  final TextEditingController _linkValueCtrl = TextEditingController();
  final TextEditingController _linkCodeCtrl = TextEditingController();
  String _locale = 'ar';
  bool _saving = false;
  bool _linkingEmail = false;
  bool _linkingPhone = false;
  String? _linkError;
  String? _linkSuccess;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _linkValueCtrl.dispose();
    _linkCodeCtrl.dispose();
    super.dispose();
  }

  void _initControllers(UserProfile p) {
    _nameCtrl = TextEditingController(text: p.fullName ?? '');
    _emailCtrl = TextEditingController(text: p.email ?? '');
    _locale = p.locale ?? 'ar';
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(apiServiceProvider).updateProfile(
            fullName: _nameCtrl.text,
            email: _emailCtrl.text,
            locale: _locale,
          );
      ref.invalidate(profileProvider);
      setState(() => _editing = false);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Session sign-out. Moved here from the old Home app bar now that Account is
  /// a persistent tab: shut down push, clear stored tokens, drop the in-memory
  /// access token, flip auth state, clear the cached login identity, and route
  /// to login.
  Future<void> _signOut() async {
    ref.read(pushNotificationServiceProvider).shutdown();
    await ref.read(authStorageProvider).clearTokens();
    ref.read(apiClientProvider).clearAccessToken();
    ref.read(isAuthenticatedProvider.notifier).state = false;
    // S1.38.2: the identity cache is separate from auth state, so it has to be
    // reset here too — otherwise Home shows the previous user's email/phone to
    // whoever signs in next on this device.
    resetIdentityProviders(ref);
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(profileProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Profile'),
        actions: [
          if (!_editing)
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () {
                setState(() => _editing = true);
              },
            ),
        ],
      ),
      body: profile.when(
        data: (p) {
          if (!_editing) _initControllers(p);
          return _editing ? _editForm(p) : _viewMode(p);
        },
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error loading profile',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(profileProvider),
        ),
      ),
    );
  }

  Widget _viewMode(UserProfile p) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        CircleAvatar(
          radius: 40,
          backgroundColor: TaifTokens.brandPrimary,
          child: Text(
            (p.fullName ?? p.phone ?? p.email ?? '?')
                .substring(0, 1)
                .toUpperCase(),
            style: const TextStyle(fontSize: 32, color: Colors.white),
          ),
        ),
        const SizedBox(height: 16),
        Center(
            child: Text(p.fullName ?? 'No name set',
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700))),
        Center(
            child: Text(p.phone ?? 'Not linked',
                style: const TextStyle(color: TaifTokens.muted))),
        const SizedBox(height: 24),
        _infoTile('Email', p.email ?? 'Not set', Icons.email),
        _infoTile(
            'Locale', p.locale == 'ar' ? 'Arabic' : 'English', Icons.language),
        _infoTile('Status', p.status, Icons.verified_user),
        const SizedBox(height: 24),
        if (p.organizations.isNotEmpty) ...[
          const Text('Organizations',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          ...p.organizations.map((o) => Card(
                child: ListTile(
                  leading: const Icon(Icons.business),
                  title: Text(o.orgName),
                  subtitle: Text('${o.role} · ${o.orgType}'),
                  trailing: o.orgId ==
                          (ref.watch(activeOrgIdProvider) ?? p.activeOrgId)
                      ? const Chip(
                          label: Text('Active'),
                          backgroundColor: Color(0xFFDCFCE7))
                      : null,
                ),
              )),
        ],
        const SizedBox(height: 24),
        // Authentication Methods (S1.38 Flutter integration)
        const Text('Authentication Methods',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        if (_linkSuccess != null)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: TaifTokens.ok.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(_linkSuccess!,
                style: TextStyle(color: TaifTokens.ok, fontSize: 13)),
          ),
        if (_linkError != null)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(_linkError!,
                style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
          ),
        // Email row
        Card(
          child: ListTile(
            leading: const Icon(Icons.email, color: TaifTokens.brandPrimary),
            title: const Text('Email'),
            subtitle: Text(p.email ?? 'Not linked'),
            trailing: p.email != null
                ? TextButton(
                    onPressed:
                        _linkingEmail ? null : () => _confirmUnlinkEmail(p),
                    child: const Text('Remove',
                        style: TextStyle(color: TaifTokens.err)),
                  )
                : TextButton(
                    onPressed:
                        _linkingEmail ? null : () => _showLinkEmailDialog(p),
                    child: const Text('Link'),
                  ),
          ),
        ),
        // Phone row
        Card(
          child: ListTile(
            leading: const Icon(Icons.phone, color: TaifTokens.brandPrimary),
            title: const Text('Phone'),
            subtitle: Text(p.phone ?? 'Not linked'),
            trailing: p.phone != null
                ? TextButton(
                    onPressed:
                        _linkingPhone ? null : () => _confirmUnlinkPhone(p),
                    child: const Text('Remove',
                        style: TextStyle(color: TaifTokens.err)),
                  )
                : TextButton(
                    onPressed:
                        _linkingPhone ? null : () => _showLinkPhoneDialog(p),
                    child: const Text('Link'),
                  ),
          ),
        ),
        const SizedBox(height: 24),
        const Text('Security',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.security, color: TaifTokens.brandPrimary),
            title: const Text('Login Credentials'),
            subtitle: Text(p.email != null
                ? 'Email/Password enabled'
                : 'Set up email/password'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/profile/credentials'),
          ),
        ),
        if (p.email != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.lock, color: TaifTokens.brandPrimary),
              title: const Text('Change Password'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/profile/change-password'),
            ),
          ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.devices, color: TaifTokens.brandPrimary),
            title: const Text('Active Sessions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/profile/sessions'),
          ),
        ),
        const SizedBox(height: 24),
        Card(
          child: ListTile(
            leading: const Icon(Icons.notifications_outlined,
                color: TaifTokens.brandPrimary),
            title: const Text('Notifications'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/notifications'),
          ),
        ),
        if (!widget.hideMerchantEntry &&
            (p.role == 'MERCHANT_OWNER' || p.role == 'MERCHANT_STAFF'))
          Card(
            child: ListTile(
              leading:
                  const Icon(Icons.storefront, color: TaifTokens.brandPrimary),
              title: const Text('Merchant Dashboard'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/merchant'),
            ),
          ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _signOut,
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(
              foregroundColor: TaifTokens.err,
              side: const BorderSide(color: TaifTokens.err),
            ),
          ),
        ),
      ]);

  Widget _editForm(UserProfile p) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        TextField(
          controller: _nameCtrl,
          decoration: const InputDecoration(
              labelText: 'Full Name', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _emailCtrl,
          decoration: const InputDecoration(
              labelText: 'Email', border: OutlineInputBorder()),
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: _locale,
          decoration: const InputDecoration(
              labelText: 'Language', border: OutlineInputBorder()),
          items: const [
            DropdownMenuItem(value: 'ar', child: Text('Arabic')),
            DropdownMenuItem(value: 'en', child: Text('English')),
          ],
          onChanged: (v) {
            if (v != null) setState(() => _locale = v);
          },
        ),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => setState(() => _editing = false),
              child: const Text('Cancel'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                  backgroundColor: TaifTokens.brandPrimary),
              child: Text(_saving ? 'Saving...' : 'Save'),
            ),
          ),
        ]),
      ]);

  Widget _infoTile(String label, String value, IconData icon) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          leading: Icon(icon, color: TaifTokens.brandPrimary),
          title: Text(label,
              style: const TextStyle(fontSize: 12, color: Colors.grey)),
          subtitle: Text(value, style: const TextStyle(fontSize: 15)),
        ),
      );

  // ── Account linking dialogs (S1.38 Flutter integration) ──

  Future<void> _showLinkEmailDialog(UserProfile p) async {
    // `await showDialog` completes the moment the route is popped, while the
    // dialog is still animating out with its TextFields mounted. The
    // controllers therefore belong to the State, not to this method.
    final emailCtrl = _linkValueCtrl..clear();
    final otpCtrl = _linkCodeCtrl..clear();
    bool otpSent = false;
    bool codeUncertain = false;
    String? localError;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Link Email'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (localError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(localError!,
                      style:
                          TextStyle(color: Colors.red.shade700, fontSize: 13)),
                ),
              if (!otpSent) ...[
                TextField(
                  controller: emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                      labelText: 'Email address', border: OutlineInputBorder()),
                ),
              ] else ...[
                Text(codeUncertain
                    ? 'If a code arrived for ${emailCtrl.text}, enter it below.'
                    : 'Code sent to ${emailCtrl.text}'),
                const SizedBox(height: 8),
                TextField(
                  controller: otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  decoration: const InputDecoration(
                      labelText: 'OTP',
                      border: OutlineInputBorder(),
                      counterText: ''),
                ),
              ],
            ]),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            if (!otpSent)
              ElevatedButton(
                onPressed: () async {
                  if (emailCtrl.text.isEmpty) return;
                  setDialogState(() {
                    localError = null;
                  });
                  try {
                    final result = await ref
                        .read(apiServiceProvider)
                        .requestEmailOtp(emailCtrl.text);
                    final send = _otpSendOutcome(result,
                        channel: 'Email', target: 'address');
                    setDialogState(() {
                      otpSent = send.advance;
                      codeUncertain = send.uncertain;
                      localError = send.message;
                    });
                  } catch (e) {
                    setDialogState(() {
                      localError = ApiService.errorMessage(e);
                    });
                  }
                },
                child: const Text('Send OTP'),
              )
            else
              ElevatedButton(
                onPressed: () async {
                  try {
                    await ref
                        .read(apiServiceProvider)
                        .linkEmail(emailCtrl.text, otpCtrl.text);
                    setState(() {
                      _linkSuccess = 'Email linked successfully.';
                      _linkError = null;
                    });
                    ref.invalidate(profileProvider);
                    if (ctx.mounted) Navigator.pop(ctx);
                  } catch (e) {
                    setDialogState(() {
                      localError = ApiService.errorMessage(e);
                    });
                  }
                },
                child: const Text('Link'),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _showLinkPhoneDialog(UserProfile p) async {
    final phoneCtrl = _linkValueCtrl..clear();
    final otpCtrl = _linkCodeCtrl..clear();
    bool otpSent = false;
    bool codeUncertain = false;
    String? localError;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Link Phone'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (localError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(localError!,
                      style:
                          TextStyle(color: Colors.red.shade700, fontSize: 13)),
                ),
              if (!otpSent) ...[
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                      labelText: 'Phone number',
                      hintText: '+9665XXXXXXXX',
                      border: OutlineInputBorder()),
                ),
              ] else ...[
                Text(codeUncertain
                    ? 'If a code arrived for ${phoneCtrl.text}, enter it below.'
                    : 'Code sent to ${phoneCtrl.text}'),
                const SizedBox(height: 8),
                TextField(
                  controller: otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  decoration: const InputDecoration(
                      labelText: 'OTP',
                      border: OutlineInputBorder(),
                      counterText: ''),
                ),
              ],
            ]),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            if (!otpSent)
              ElevatedButton(
                onPressed: () async {
                  if (phoneCtrl.text.isEmpty) return;
                  setDialogState(() {
                    localError = null;
                  });
                  try {
                    final result = await ref
                        .read(apiServiceProvider)
                        .requestOtp(phoneCtrl.text);
                    final send = _otpSendOutcome(result,
                        channel: 'SMS', target: 'number');
                    setDialogState(() {
                      otpSent = send.advance;
                      codeUncertain = send.uncertain;
                      localError = send.message;
                    });
                  } catch (e) {
                    setDialogState(() {
                      localError = ApiService.errorMessage(e);
                    });
                  }
                },
                child: const Text('Send OTP'),
              )
            else
              ElevatedButton(
                onPressed: () async {
                  try {
                    await ref
                        .read(apiServiceProvider)
                        .linkPhone(phoneCtrl.text, otpCtrl.text);
                    setState(() {
                      _linkSuccess = 'Phone linked successfully.';
                      _linkError = null;
                    });
                    ref.invalidate(profileProvider);
                    if (ctx.mounted) Navigator.pop(ctx);
                  } catch (e) {
                    setDialogState(() {
                      localError = ApiService.errorMessage(e);
                    });
                  }
                },
                child: const Text('Link'),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmUnlinkEmail(UserProfile p) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Email'),
        content: const Text(
            'Remove email from your account? You will no longer be able to use email OTP to sign in.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() {
      _linkingEmail = true;
      _linkError = null;
      _linkSuccess = null;
    });
    try {
      await ref.read(apiServiceProvider).unlinkEmail();
      setState(() {
        _linkSuccess = 'Email removed from account.';
        _linkError = null;
      });
      ref.invalidate(profileProvider);
    } catch (e) {
      setState(() {
        _linkError = ApiService.errorMessage(e);
      });
    } finally {
      if (mounted) setState(() => _linkingEmail = false);
    }
  }

  Future<void> _confirmUnlinkPhone(UserProfile p) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Phone'),
        content: const Text(
            'Remove phone from your account? You will no longer be able to use phone OTP to sign in.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() {
      _linkingPhone = true;
      _linkError = null;
      _linkSuccess = null;
    });
    try {
      await ref.read(apiServiceProvider).unlinkPhone();
      setState(() {
        _linkSuccess = 'Phone removed from account.';
        _linkError = null;
      });
      ref.invalidate(profileProvider);
    } catch (e) {
      setState(() {
        _linkError = ApiService.errorMessage(e);
      });
    } finally {
      if (mounted) setState(() => _linkingPhone = false);
    }
  }
}
