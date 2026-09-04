import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';

/// 5-step merchant registration wizard mirroring the web /merchant/register page.
/// Steps: Profile → Business Details → Store Info → Documents → Review & Submit
class MerchantRegistrationScreen extends ConsumerStatefulWidget {
  const MerchantRegistrationScreen({super.key});
  @override
  ConsumerState<MerchantRegistrationScreen> createState() =>
      _MerchantRegistrationScreenState();
}

class _MerchantRegistrationScreenState
    extends ConsumerState<MerchantRegistrationScreen> {
  static const _steps = [
    'Your Profile',
    'Business Details',
    'Store Info',
    'Documents',
    'Review & Submit',
  ];

  static const _orgTypes = [
    ('WHOLESALER', 'Wholesaler'),
    ('RETAILER', 'Retailer'),
    ('LOGISTICS', 'Logistics Provider'),
  ];

  static const _countries = [
    ('SA', 'Saudi Arabia'),
    ('AE', 'United Arab Emirates'),
    ('KW', 'Kuwait'),
    ('BH', 'Bahrain'),
    ('OM', 'Oman'),
    ('QA', 'Qatar'),
  ];

  static const _docTypes = [
    ('COMMERCIAL_REG', 'Commercial Registration'),
    ('TAX_CERT', 'Tax Certificate'),
    ('BANK_LETTER', 'Bank Letter'),
    ('NATIONAL_ID', 'National ID'),
  ];

  static const _currencies = ['SAR', 'AED', 'KWD', 'BHD', 'OMR', 'QAR'];

  final _pageCtrl = PageController();
  int _currentStep = 0;
  bool _submitting = false;
  String? _error;

  // Step 1: Profile
  final _fullNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();

  // Step 2: Business
  final _orgNameCtrl = TextEditingController();
  final _legalNameCtrl = TextEditingController();
  String _orgType = 'WHOLESALER';
  String _country = 'SA';
  final _taxIdCtrl = TextEditingController();

  // Step 3: Store
  final _displayNameCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  String _currency = 'SAR';
  String _locale = 'ar';
  final _cityCtrl = TextEditingController();

  // Step 3b: Warehouse (optional)
  final _warehouseNameCtrl = TextEditingController();
  final _warehouseCityCtrl = TextEditingController();
  final _managerNameCtrl = TextEditingController();

  // Step 4: Documents
  final List<({String docType, String fileName})> _documents = [];
  String _newDocType = 'COMMERCIAL_REG';
  final _newDocNameCtrl = TextEditingController();

  // Created IDs
  String? _createdOrgId;
  String? _createdStoreId;

  @override
  void dispose() {
    _pageCtrl.dispose();
    _fullNameCtrl.dispose();
    _emailCtrl.dispose();
    _orgNameCtrl.dispose();
    _legalNameCtrl.dispose();
    _taxIdCtrl.dispose();
    _displayNameCtrl.dispose();
    _descriptionCtrl.dispose();
    _cityCtrl.dispose();
    _warehouseNameCtrl.dispose();
    _warehouseCityCtrl.dispose();
    _managerNameCtrl.dispose();
    _newDocNameCtrl.dispose();
    super.dispose();
  }

  void _goToStep(int step) {
    _pageCtrl.animateToPage(step,
        duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    setState(() => _currentStep = step);
  }

  void _addDocument() {
    final name = _newDocNameCtrl.text.trim();
    if (name.isEmpty) return;
    setState(() {
      _documents.add((docType: _newDocType, fileName: name));
      _newDocNameCtrl.clear();
    });
  }

  void _removeDocument(int idx) {
    setState(() => _documents.removeAt(idx));
  }

  Future<void> _handleNext() async {
    setState(() => _error = null);
    final api = ref.read(apiServiceProvider);

    if (_currentStep == 0) {
      // Validate & update profile
      if (_fullNameCtrl.text.trim().isEmpty) {
        setState(() => _error = 'Full name is required');
        return;
      }
      setState(() => _submitting = true);
      try {
        await api.updateProfile(
          fullName: _fullNameCtrl.text.trim(),
          email: _emailCtrl.text.trim().isEmpty ? null : _emailCtrl.text.trim(),
        );
        ref.invalidate(profileProvider);
        _goToStep(1);
      } catch (e) {
        setState(() => _error = 'Failed to update profile: $e');
      } finally {
        if (mounted) setState(() => _submitting = false);
      }
    } else if (_currentStep == 1) {
      // Validate & create organization
      if (_orgNameCtrl.text.trim().isEmpty) {
        setState(() => _error = 'Business name is required');
        return;
      }
      setState(() => _submitting = true);
      try {
        final org = await api.createOrganization(
          name: _orgNameCtrl.text.trim(),
          type: _orgType,
          country: _country,
          legalName: _legalNameCtrl.text.trim().isEmpty
              ? null
              : _legalNameCtrl.text.trim(),
          taxId: _taxIdCtrl.text.trim().isEmpty ? null : _taxIdCtrl.text.trim(),
        );
        setState(() => _createdOrgId = org.id);
        _goToStep(2);
      } catch (e) {
        setState(() => _error = 'Failed to create organization: $e');
      } finally {
        if (mounted) setState(() => _submitting = false);
      }
    } else if (_currentStep == 2) {
      // Validate & create store + optional warehouse
      if (_displayNameCtrl.text.trim().isEmpty) {
        setState(() => _error = 'Store name is required');
        return;
      }
      if (_createdOrgId == null) {
        setState(() => _error = 'Organization not created. Go back.');
        return;
      }
      setState(() => _submitting = true);
      try {
        final store = await api.createStore(
          orgId: _createdOrgId!,
          displayName: _displayNameCtrl.text.trim(),
          description: _descriptionCtrl.text.trim().isEmpty
              ? null
              : _descriptionCtrl.text.trim(),
          currency: _currency,
          locale: _locale,
          address: _cityCtrl.text.trim().isNotEmpty
              ? {'city': _cityCtrl.text.trim()}
              : null,
        );
        setState(() => _createdStoreId = store.id);

        // Create warehouse if provided
        if (_warehouseNameCtrl.text.trim().isNotEmpty) {
          await api.createWarehouse(
            store.id,
            name: _warehouseNameCtrl.text.trim(),
            address: _warehouseCityCtrl.text.trim().isNotEmpty
                ? {'city': _warehouseCityCtrl.text.trim()}
                : null,
            managerName: _managerNameCtrl.text.trim().isEmpty
                ? null
                : _managerNameCtrl.text.trim(),
          );
        }
        _goToStep(3);
      } catch (e) {
        setState(() => _error = 'Failed to create store: $e');
      } finally {
        if (mounted) setState(() => _submitting = false);
      }
    } else if (_currentStep == 3) {
      // Register documents
      if (_documents.isNotEmpty &&
          _createdStoreId != null &&
          _createdOrgId != null) {
        setState(() => _submitting = true);
        try {
          for (final doc in _documents) {
            await api.registerDocument(
              orgId: _createdOrgId!,
              storeId: _createdStoreId,
              docType: doc.docType,
              fileName: doc.fileName,
              fileSize: 0,
            );
          }
        } catch (e) {
          setState(() => _error = 'Failed to register documents: $e');
          if (mounted) setState(() => _submitting = false);
          return;
        } finally {
          if (mounted) setState(() => _submitting = false);
        }
      }
      _goToStep(4);
    }
  }

  Future<void> _handleSubmit() async {
    if (_createdStoreId == null) return;
    setState(() => _submitting = true);
    setState(() => _error = null);
    try {
      await ref.read(apiServiceProvider).submitVerification(_createdStoreId!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content:
                Text('Registration submitted! Awaiting admin verification.'),
            backgroundColor: TaifTokens.ok,
          ),
        );
        context.go('/home');
      }
    } catch (e) {
      setState(() => _error = 'Failed to submit: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Merchant Registration'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          // Step indicator
          _stepIndicator(),
          // Content
          Expanded(
            child: PageView(
              controller: _pageCtrl,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _profileStep(),
                _businessStep(),
                _storeStep(),
                _documentsStep(),
                _reviewStep(),
              ],
            ),
          ),
          // Navigation
          _navBar(),
        ],
      ),
    );
  }

  Widget _stepIndicator() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: List.generate(_steps.length, (idx) {
          return Expanded(
            child: Container(
              margin: EdgeInsets.only(right: idx < _steps.length - 1 ? 4 : 0),
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: idx <= _currentStep
                        ? TaifTokens.brandPrimary
                        : TaifTokens.line,
                    width: 3,
                  ),
                ),
              ),
              child: Text(
                '${idx + 1}. ${_steps[idx]}',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight:
                      idx == _currentStep ? FontWeight.w600 : FontWeight.w400,
                  color: idx <= _currentStep
                      ? TaifTokens.brandPrimary
                      : TaifTokens.muted,
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _profileStep() => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Tell us about yourself.',
            style: TextStyle(color: TaifTokens.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _fullNameCtrl,
            decoration: const InputDecoration(
              labelText: 'Full Name *',
              hintText: 'e.g. Ahmed Al-Rashid',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _emailCtrl,
            decoration: const InputDecoration(
              labelText: 'Email Address',
              hintText: 'e.g. ahmed@company.com',
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 16),
          Consumer(builder: (_, ref, __) {
            final profile = ref.watch(profileProvider).valueOrNull;
            if (profile == null) return const SizedBox.shrink();
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: TaifTokens.ok.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
              ),
              child: Text(
                'Phone: ${profile.phone} (verified via OTP)',
                style: const TextStyle(color: TaifTokens.ok, fontSize: 13),
              ),
            );
          }),
        ],
      );

  Widget _businessStep() => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Enter your business information for verification.',
            style: TextStyle(color: TaifTokens.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _orgNameCtrl,
            decoration: const InputDecoration(
              labelText: 'Business Name *',
              hintText: 'e.g. Al-Baraka Trading Co.',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _legalNameCtrl,
            decoration: const InputDecoration(
              labelText: 'Legal Name',
              hintText: 'Official registered name (if different)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _orgType,
            decoration: const InputDecoration(
              labelText: 'Business Type *',
              border: OutlineInputBorder(),
            ),
            items: _orgTypes
                .map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _orgType = v);
            },
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _country,
            decoration: const InputDecoration(
              labelText: 'Country *',
              border: OutlineInputBorder(),
            ),
            items: _countries
                .map((c) => DropdownMenuItem(value: c.$1, child: Text(c.$2)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _country = v);
            },
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _taxIdCtrl,
            decoration: const InputDecoration(
              labelText: 'Tax ID / VAT',
              hintText: 'Optional',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      );

  Widget _storeStep() => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Set up your storefront on the platform.',
            style: TextStyle(color: TaifTokens.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _displayNameCtrl,
            decoration: const InputDecoration(
              labelText: 'Store Name *',
              hintText: 'e.g. Al-Baraka Wholesale',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descriptionCtrl,
            decoration: const InputDecoration(
              labelText: 'Description',
              hintText: 'Brief description of your store...',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _currency,
                decoration: const InputDecoration(
                  labelText: 'Currency',
                  border: OutlineInputBorder(),
                ),
                items: _currencies
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _currency = v);
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _locale,
                decoration: const InputDecoration(
                  labelText: 'Locale',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'ar', child: Text('Arabic')),
                  DropdownMenuItem(value: 'en', child: Text('English')),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _locale = v);
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextField(
                controller: _cityCtrl,
                decoration: const InputDecoration(
                  labelText: 'City',
                  hintText: 'e.g. Riyadh',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
          ]),
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 8),
          Text(
            'Optional: Add a warehouse now.',
            style: TextStyle(color: TaifTokens.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _warehouseNameCtrl,
            decoration: const InputDecoration(
              labelText: 'Warehouse Name',
              hintText: 'e.g. Main Warehouse',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _warehouseCityCtrl,
            decoration: const InputDecoration(
              labelText: 'City',
              hintText: 'e.g. Jeddah',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _managerNameCtrl,
            decoration: const InputDecoration(
              labelText: 'Manager Name',
              hintText: 'Optional',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      );

  Widget _documentsStep() => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Upload verification documents. You can skip and add later.',
            style: TextStyle(color: TaifTokens.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          if (_documents.isNotEmpty) ...[
            ..._documents.asMap().entries.map((entry) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.description,
                        color: TaifTokens.brandPrimary),
                    title: Text(
                      _docTypes
                          .firstWhere((d) => d.$1 == entry.value.docType)
                          .$2,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(entry.value.fileName),
                    trailing: IconButton(
                      icon: const Icon(Icons.close, color: TaifTokens.err),
                      onPressed: () => _removeDocument(entry.key),
                    ),
                  ),
                )),
            const SizedBox(height: 16),
          ],
          DropdownButtonFormField<String>(
            initialValue: _newDocType,
            decoration: const InputDecoration(
              labelText: 'Document Type',
              border: OutlineInputBorder(),
            ),
            items: _docTypes
                .map((d) => DropdownMenuItem(value: d.$1, child: Text(d.$2)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _newDocType = v);
            },
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _newDocNameCtrl,
                decoration: const InputDecoration(
                  labelText: 'File Name',
                  hintText: 'e.g. cr_certificate.pdf',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 12),
            ElevatedButton(
              onPressed: _addDocument,
              style: ElevatedButton.styleFrom(
                  backgroundColor: TaifTokens.brandPrimary),
              child: const Text('Add'),
            ),
          ]),
        ],
      );

  Widget _reviewStep() {
    String orgTypeLabel = _orgTypes.firstWhere((t) => t.$1 == _orgType).$2;
    String countryLabel = _countries.firstWhere((c) => c.$1 == _country).$2;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Registration Summary',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              _summaryRow('Your Name', _fullNameCtrl.text.trim()),
              if (_emailCtrl.text.trim().isNotEmpty)
                _summaryRow('Email', _emailCtrl.text.trim()),
              const Divider(height: 16),
              _summaryRow('Business', _orgNameCtrl.text.trim()),
              if (_legalNameCtrl.text.trim().isNotEmpty)
                _summaryRow('Legal Name', _legalNameCtrl.text.trim()),
              _summaryRow('Type', orgTypeLabel),
              _summaryRow('Country', countryLabel),
              if (_taxIdCtrl.text.trim().isNotEmpty)
                _summaryRow('Tax ID', _taxIdCtrl.text.trim()),
              const Divider(height: 16),
              _summaryRow('Store', _displayNameCtrl.text.trim()),
              _summaryRow('Currency', _currency),
              _summaryRow('Locale', _locale == 'ar' ? 'Arabic' : 'English'),
              if (_cityCtrl.text.trim().isNotEmpty)
                _summaryRow('City', _cityCtrl.text.trim()),
              if (_warehouseNameCtrl.text.trim().isNotEmpty)
                _summaryRow('Warehouse', _warehouseNameCtrl.text.trim()),
              _summaryRow('Documents', '${_documents.length} file(s)'),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: TaifTokens.info.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(TaifTokens.radiusSm),
          ),
          child: const Text(
            'By submitting, your store will be queued for platform verification. '
            'An admin will review your application and approve or request changes.',
            style: TextStyle(fontSize: 13, color: TaifTokens.info),
          ),
        ),
      ],
    );
  }

  Widget _summaryRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: TextStyle(color: TaifTokens.muted, fontSize: 14)),
            Text(value,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          ],
        ),
      );

  Widget _navBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TaifTokens.surface,
        border: Border(top: BorderSide(color: TaifTokens.line)),
      ),
      child: SafeArea(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            if (_currentStep > 0)
              OutlinedButton(
                onPressed:
                    _submitting ? null : () => _goToStep(_currentStep - 1),
                child: const Text('← Previous'),
              )
            else
              const SizedBox.shrink(),
            if (_error != null)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(_error!,
                      style:
                          const TextStyle(color: TaifTokens.err, fontSize: 12),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                ),
              )
            else
              const SizedBox.shrink(),
            if (_currentStep < 4)
              ElevatedButton(
                onPressed: _submitting ? null : _handleNext,
                style: ElevatedButton.styleFrom(
                    backgroundColor: TaifTokens.brandPrimary),
                child: Text(_submitting ? 'Processing...' : 'Next →'),
              )
            else
              ElevatedButton(
                onPressed: _submitting ? null : _handleSubmit,
                style: ElevatedButton.styleFrom(backgroundColor: TaifTokens.ok),
                child: Text(
                    _submitting ? 'Submitting...' : 'Submit for Verification'),
              ),
          ],
        ),
      ),
    );
  }
}
