import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class OrganizationsScreen extends ConsumerStatefulWidget {
  const OrganizationsScreen({super.key});
  @override
  ConsumerState<OrganizationsScreen> createState() =>
      _OrganizationsScreenState();
}

class _OrganizationsScreenState extends ConsumerState<OrganizationsScreen> {
  bool _showCreate = false;
  final _nameCtrl = TextEditingController();
  final _countryCtrl = TextEditingController();
  String _type = 'MERCHANT';
  bool _creating = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _countryCtrl.dispose();
    super.dispose();
  }

  Future<void> _createOrg() async {
    if (_nameCtrl.text.isEmpty || _countryCtrl.text.isEmpty) return;
    setState(() => _creating = true);
    try {
      await ref.read(apiServiceProvider).createOrganization(
            name: _nameCtrl.text,
            type: _type,
            country: _countryCtrl.text,
          );
      ref.invalidate(myOrganizationsProvider);
      setState(() {
        _showCreate = false;
        _nameCtrl.clear();
        _countryCtrl.clear();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _switchOrg(String orgId) async {
    try {
      await ref.read(apiServiceProvider).switchOrg(orgId);
      ref.read(activeOrgIdProvider.notifier).state = orgId;
      ref.read(authStorageProvider).setActiveOrgId(orgId);
      ref.invalidate(profileProvider);
      ref.invalidate(myOrganizationsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Organization switched')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to switch: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final orgs = ref.watch(myOrganizationsProvider);
    final activeOrg = ref.watch(activeOrgIdProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Organizations'),
        actions: [
          IconButton(
            icon: Icon(_showCreate ? Icons.close : Icons.add),
            onPressed: () => setState(() => _showCreate = !_showCreate),
          ),
        ],
      ),
      body: Column(children: [
        if (_showCreate)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
                color: Colors.white,
                border: Border(
                    bottom: BorderSide(
                        color: TaifTokens.muted.withValues(alpha: 0.2)))),
            child: Column(children: [
              TextField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Organization Name',
                      border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(
                  controller: _countryCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Country', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: _type,
                decoration: const InputDecoration(
                    labelText: 'Type', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'MERCHANT', child: Text('Merchant')),
                  DropdownMenuItem(value: 'BUYER', child: Text('Buyer')),
                  DropdownMenuItem(value: 'SUPPLIER', child: Text('Supplier')),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _type = v);
                },
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _creating ? null : _createOrg,
                  style: ElevatedButton.styleFrom(
                      backgroundColor: TaifTokens.brandPrimary),
                  child:
                      Text(_creating ? 'Creating...' : 'Create Organization'),
                ),
              ),
            ]),
          ),
        Expanded(
          child: orgs.when(
            data: (list) => list.isEmpty
                ? const EmptyState(
                    title: 'No organizations',
                    description: 'Create one to get started')
                : RefreshIndicator(
                    onRefresh: () async =>
                        ref.invalidate(myOrganizationsProvider),
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: list.length,
                      itemBuilder: (_, i) {
                        final o = list[i];
                        final isActive = o.orgId == activeOrg;
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: isActive
                                  ? TaifTokens.ok
                                  : TaifTokens.brandPrimary
                                      .withValues(alpha: 0.15),
                              child: Text(
                                  o.orgName.substring(0, 1).toUpperCase(),
                                  style: TextStyle(
                                      color: isActive
                                          ? Colors.white
                                          : TaifTokens.brandPrimary)),
                            ),
                            title: Text(o.orgName,
                                style: TextStyle(
                                    fontWeight: isActive
                                        ? FontWeight.w700
                                        : FontWeight.w500)),
                            subtitle: Text('${o.role} · ${o.orgType}'),
                            trailing: isActive
                                ? const Chip(
                                    label: Text('Active'),
                                    backgroundColor: Color(0xFFDCFCE7))
                                : TextButton(
                                    onPressed: () => _switchOrg(o.orgId),
                                    child: const Text('Switch',
                                        style: TextStyle(fontSize: 12)),
                                  ),
                            onTap: () =>
                                context.push('/organizations/${o.orgId}'),
                          ),
                        );
                      },
                    ),
                  ),
            loading: () => const LoadingSpinner(),
            error: (e, _) => EmptyState(
              title: 'Error',
              description: '$e',
              onAction: () => ref.invalidate(myOrganizationsProvider),
            ),
          ),
        ),
      ]),
    );
  }
}
