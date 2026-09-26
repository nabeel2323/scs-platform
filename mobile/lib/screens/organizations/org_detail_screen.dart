import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_core/mobile_core.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/api_service.dart';
import '../../widgets/common_widgets.dart';

class OrgDetailScreen extends ConsumerWidget {
  final String orgId;
  const OrgDetailScreen({super.key, required this.orgId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orgAsync = ref.watch(orgDetailProvider(orgId));
    final members = ref.watch(orgMembersProvider(orgId));
    final org = orgAsync.valueOrNull;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Organization'),
          actions: [
            if (org != null)
              IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  tooltip: 'Edit',
                  onPressed: () => _showEditDialog(context, ref, org)),
          ],
          bottom:
              const TabBar(tabs: [Tab(text: 'Details'), Tab(text: 'Members')]),
        ),
        body: TabBarView(children: [
          _detailsTab(context, ref, orgAsync),
          _membersTab(context, ref, members),
        ]),
      ),
    );
  }

  Widget _detailsTab(
          BuildContext context, WidgetRef ref, AsyncValue<Organization> org) =>
      org.when(
        data: (o) => ListView(padding: const EdgeInsets.all(16), children: [
          _field('Name', o.name),
          _field('Type', o.type),
          _field('Country', o.country),
          _field('Legal Name', o.legalName ?? '—'),
          _field('Tax ID', o.taxId ?? '—'),
          if (o.inviteCode != null && o.inviteCode!.isNotEmpty)
            _field('Invite Code', o.inviteCode!),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _showEditDialog(context, ref, o),
              icon: const Icon(Icons.edit),
              label: const Text('Edit Organization'),
              style: OutlinedButton.styleFrom(
                  foregroundColor: TaifTokens.brandPrimary,
                  side: const BorderSide(color: TaifTokens.brandPrimary),
                  padding: const EdgeInsets.symmetric(vertical: 14)),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => _showSwitchDialog(context, ref, o.id),
              icon: const Icon(Icons.swap_horiz),
              label: const Text('Switch to this Organization'),
              style: ElevatedButton.styleFrom(
                  backgroundColor: TaifTokens.brandPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
            ),
          ),
        ]),
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(orgDetailProvider(orgId)),
        ),
      );

  Widget _membersTab(BuildContext context, WidgetRef ref,
          AsyncValue<List<OrgMember>> members) =>
      members.when(
        data: (list) => Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
            child: Row(children: [
              Text('${list.length} member${list.length == 1 ? '' : 's'}',
                  style:
                      const TextStyle(color: TaifTokens.muted, fontSize: 13)),
              const Spacer(),
              TextButton.icon(
                  onPressed: () => _showAddMemberDialog(context, ref),
                  icon: const Icon(Icons.person_add_alt, size: 18),
                  label: const Text('Add Member')),
            ]),
          ),
          Expanded(
            child: list.isEmpty
                ? EmptyState(
                    title: 'No members',
                    description: 'Add members to collaborate',
                    onAction: () => _showAddMemberDialog(context, ref),
                    actionLabel: 'Add Member')
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    itemCount: list.length,
                    itemBuilder: (_, i) {
                      final m = list[i];
                      final letter = m.userName.isNotEmpty
                          ? m.userName.substring(0, 1).toUpperCase()
                          : '?';
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor:
                                TaifTokens.brandPrimary.withValues(alpha: 0.15),
                            child: Text(letter,
                                style: const TextStyle(
                                    color: TaifTokens.brandPrimary)),
                          ),
                          title:
                              Text(m.userName.isEmpty ? 'Unknown' : m.userName),
                          subtitle: Text(m.userEmail ?? m.userId),
                          trailing:
                              Row(mainAxisSize: MainAxisSize.min, children: [
                            Chip(
                                label: Text(m.roleId,
                                    style: const TextStyle(fontSize: 11))),
                            IconButton(
                                icon: const Icon(Icons.remove_circle_outline,
                                    color: TaifTokens.err),
                                tooltip: 'Remove',
                                onPressed: () =>
                                    _confirmRemoveMember(context, ref, m)),
                          ]),
                        ),
                      );
                    },
                  ),
          ),
        ]),
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: ApiService.errorMessage(e),
          onAction: () => ref.invalidate(orgMembersProvider(orgId)),
        ),
      );

  Widget _field(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(children: [
          SizedBox(
              width: 100,
              child: Text(label,
                  style:
                      const TextStyle(color: TaifTokens.muted, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 15))),
        ]),
      );

  Future<void> _showEditDialog(
      BuildContext context, WidgetRef ref, Organization o) async {
    final nameCtrl = TextEditingController(text: o.name);
    final legalCtrl = TextEditingController(text: o.legalName ?? '');
    final taxCtrl = TextEditingController(text: o.taxId ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Organization'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(
                    labelText: 'Name *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: legalCtrl,
                decoration: const InputDecoration(
                    labelText: 'Legal Name', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: taxCtrl,
                decoration: const InputDecoration(
                    labelText: 'Tax ID / VAT', border: OutlineInputBorder())),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Save')),
        ],
      ),
    );
    if (ok == true && nameCtrl.text.trim().isNotEmpty) {
      try {
        await ref.read(apiServiceProvider).updateOrganization(
              o.id,
              name: nameCtrl.text.trim(),
              legalName:
                  legalCtrl.text.trim().isEmpty ? null : legalCtrl.text.trim(),
              taxId: taxCtrl.text.trim().isEmpty ? null : taxCtrl.text.trim(),
            );
        ref.invalidate(orgDetailProvider(orgId));
        ref.invalidate(myOrganizationsProvider);
        ref.invalidate(profileProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Organization updated'),
              backgroundColor: TaifTokens.ok));
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed: ${ApiService.errorMessage(e)}')));
        }
      }
    }
    for (final c in [nameCtrl, legalCtrl, taxCtrl]) {
      c.dispose();
    }
  }

  Future<void> _showAddMemberDialog(BuildContext context, WidgetRef ref) async {
    final userIdCtrl = TextEditingController();
    final roleIdCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Member'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text(
                'Enter the user ID and role ID (UUIDs) of the member to add.',
                style: TextStyle(color: TaifTokens.muted, fontSize: 12)),
            const SizedBox(height: 12),
            TextField(
                controller: userIdCtrl,
                decoration: const InputDecoration(
                    labelText: 'User ID *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: roleIdCtrl,
                decoration: const InputDecoration(
                    labelText: 'Role ID *', border: OutlineInputBorder())),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Add')),
        ],
      ),
    );
    if (ok == true &&
        userIdCtrl.text.trim().isNotEmpty &&
        roleIdCtrl.text.trim().isNotEmpty) {
      try {
        await ref.read(apiServiceProvider).addOrgMember(orgId,
            userId: userIdCtrl.text.trim(), roleId: roleIdCtrl.text.trim());
        ref.invalidate(orgMembersProvider(orgId));
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Member added'), backgroundColor: TaifTokens.ok));
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed: ${ApiService.errorMessage(e)}')));
        }
      }
    }
    for (final c in [userIdCtrl, roleIdCtrl]) {
      c.dispose();
    }
  }

  Future<void> _confirmRemoveMember(
      BuildContext context, WidgetRef ref, OrgMember m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove member'),
        content: Text(
            'Remove ${m.userName.isEmpty ? 'this member' : m.userName} from the organization?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.err),
              child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiServiceProvider).removeOrgMember(orgId, m.userId);
      ref.invalidate(orgMembersProvider(orgId));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Member removed'), backgroundColor: TaifTokens.ok));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed: ${ApiService.errorMessage(e)}')));
      }
    }
  }

  void _showSwitchDialog(
      BuildContext context, WidgetRef ref, String targetOrgId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Switch Organization'),
        content: const Text(
            'This will change your active organization. All subsequent actions will be scoped to the new organization.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Switch')),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        final auth = ref.read(authStorageProvider);
        final res = await ref.read(apiServiceProvider).switchOrg(targetOrgId);
        // switch-org re-mints the access token and denylists the prior one
        // (API-B9), so persist the replacement immediately or the next call 401s.
        await auth.saveTokens(
          accessToken: res.accessToken,
          refreshToken: await auth.getRefreshToken() ?? '',
          expiresAt: DateTime.now().add(AuthStorage.tokenLifetime),
          activeOrgId: targetOrgId,
        );
        ref.read(apiClientProvider).setAccessToken(res.accessToken);
        ref.read(activeOrgIdProvider.notifier).state = targetOrgId;
        ref.invalidate(profileProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Organization switched')));
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed: ${ApiService.errorMessage(e)}')));
        }
      }
    }
  }
}
