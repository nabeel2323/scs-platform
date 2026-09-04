import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _editing = false;
  late TextEditingController _nameCtrl;
  late TextEditingController _emailCtrl;
  String _locale = 'ar';
  bool _saving = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
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
          description: '$e',
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
            (p.fullName ?? p.phone).substring(0, 1).toUpperCase(),
            style: const TextStyle(fontSize: 32, color: Colors.white),
          ),
        ),
        const SizedBox(height: 16),
        Center(
            child: Text(p.fullName ?? 'No name set',
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700))),
        Center(child: Text(p.phone, style: TextStyle(color: TaifTokens.muted))),
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
                  trailing: o.orgId == p.activeOrgId
                      ? const Chip(
                          label: Text('Active'),
                          backgroundColor: Color(0xFFDCFCE7))
                      : null,
                ),
              )),
        ],
        const SizedBox(height: 24),
        const Text('Security',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: Icon(Icons.security, color: TaifTokens.brandPrimary),
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
              leading: Icon(Icons.lock, color: TaifTokens.brandPrimary),
              title: const Text('Change Password'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/profile/change-password'),
            ),
          ),
        Card(
          child: ListTile(
            leading: Icon(Icons.devices, color: TaifTokens.brandPrimary),
            title: const Text('Active Sessions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/profile/sessions'),
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
}
