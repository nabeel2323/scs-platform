import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class OrgDetailScreen extends ConsumerWidget {
  final String orgId;
  const OrgDetailScreen({super.key, required this.orgId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final org = ref.watch(orgDetailProvider(orgId));
    final members = ref.watch(orgMembersProvider(orgId));
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Organization'),
          bottom:
              const TabBar(tabs: [Tab(text: 'Details'), Tab(text: 'Members')]),
        ),
        body: TabBarView(children: [
          _detailsTab(context, ref, org),
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
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => _showSwitchDialog(context, ref, o.id),
              icon: const Icon(Icons.swap_horiz),
              label: const Text('Switch to this Organization'),
              style: ElevatedButton.styleFrom(
                  backgroundColor: TaifTokens.brandPrimary),
            ),
          ),
        ]),
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: '$e',
          onAction: () => ref.invalidate(orgDetailProvider(orgId)),
        ),
      );

  Widget _membersTab(BuildContext context, WidgetRef ref,
          AsyncValue<List<OrgMember>> members) =>
      members.when(
        data: (list) => list.isEmpty
            ? const EmptyState(
                title: 'No members', description: 'Add members to collaborate')
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final m = list[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor:
                            TaifTokens.brandPrimary.withValues(alpha: 0.15),
                        child: Text(m.userName.substring(0, 1).toUpperCase(),
                            style: TextStyle(color: TaifTokens.brandPrimary)),
                      ),
                      title: Text(m.userName),
                      subtitle: Text(m.userEmail ?? m.userId),
                      trailing: Chip(
                          label: Text(m.roleId,
                              style: const TextStyle(fontSize: 11))),
                    ),
                  );
                },
              ),
        loading: () => const LoadingSpinner(),
        error: (e, _) => EmptyState(
          title: 'Error',
          description: '$e',
          onAction: () => ref.invalidate(orgMembersProvider(orgId)),
        ),
      );

  Widget _field(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(children: [
          SizedBox(
              width: 100,
              child: Text(label,
                  style: TextStyle(color: TaifTokens.muted, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 15))),
        ]),
      );

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
        await ref.read(apiServiceProvider).switchOrg(targetOrgId);
        ref.read(activeOrgIdProvider.notifier).state = targetOrgId;
        ref.read(authStorageProvider).setActiveOrgId(targetOrgId);
        ref.invalidate(profileProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Organization switched')));
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('Failed: $e')));
        }
      }
    }
  }
}
