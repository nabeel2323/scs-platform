import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../widgets/common_widgets.dart';

class ReviewsDisputesScreen extends ConsumerStatefulWidget {
  const ReviewsDisputesScreen({super.key});
  @override
  ConsumerState<ReviewsDisputesScreen> createState() =>
      _ReviewsDisputesScreenState();
}

class _ReviewsDisputesScreenState extends ConsumerState<ReviewsDisputesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl = TabController(length: 2, vsync: this);
  final _orderIdCtrl = TextEditingController();
  final _subjectIdCtrl = TextEditingController();
  final _commentCtrl = TextEditingController();
  final _disputeReasonCtrl = TextEditingController();
  final _disputeDescCtrl = TextEditingController();
  int _rating = 5;
  String _subjectType = 'STORE';
  bool _submitting = false;
  String? _msg;

  Future<void> _submitReview() async {
    if (_orderIdCtrl.text.isEmpty || _subjectIdCtrl.text.isEmpty) {
      _show('Order ID and Subject ID required', true);
      return;
    }
    setState(() {
      _submitting = true;
      _msg = null;
    });
    try {
      await ref.read(apiServiceProvider).createReview(_orderIdCtrl.text,
          subjectId: _subjectIdCtrl.text,
          subjectType: _subjectType,
          rating: _rating,
          comment: _commentCtrl.text.isEmpty ? null : _commentCtrl.text);
      _show('Review submitted!', false);
      _orderIdCtrl.clear();
      _subjectIdCtrl.clear();
      _commentCtrl.clear();
    } catch (e) {
      _show('$e', true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _submitDispute() async {
    if (_orderIdCtrl.text.isEmpty || _disputeReasonCtrl.text.isEmpty) {
      _show('Order ID and reason required', true);
      return;
    }
    setState(() {
      _submitting = true;
      _msg = null;
    });
    try {
      await ref.read(apiServiceProvider).createDispute(_orderIdCtrl.text,
          reason: _disputeReasonCtrl.text, description: _disputeDescCtrl.text);
      _show('Dispute opened!', false);
      _orderIdCtrl.clear();
      _disputeReasonCtrl.clear();
      _disputeDescCtrl.clear();
    } catch (e) {
      _show('$e', true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _show(String msg, bool isError) => setState(() {
        _msg = msg;
      });

  @override
  void dispose() {
    _orderIdCtrl.dispose();
    _subjectIdCtrl.dispose();
    _commentCtrl.dispose();
    _disputeReasonCtrl.dispose();
    _disputeDescCtrl.dispose();
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
            title: const Text('Reviews & Disputes'),
            bottom: TabBar(controller: _tabCtrl, tabs: const [
              Tab(text: 'Write Review'),
              Tab(text: 'Open Dispute')
            ])),
        body: TabBarView(controller: _tabCtrl, children: [
          SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                if (_msg != null)
                  ErrorBanner(message: _msg!, onRetry: _submitReview),
                _field('Order ID *', _orderIdCtrl),
                _field('Subject ID (Store/User) *', _subjectIdCtrl),
                const SizedBox(height: 12),
                const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Subject Type',
                        style: TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 13))),
                DropdownButton<String>(
                    value: _subjectType,
                    items: ['STORE', 'DRIVER', 'BUYER']
                        .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                        .toList(),
                    onChanged: (v) => setState(() => _subjectType = v!)),
                const SizedBox(height: 12),
                const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Rating',
                        style: TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 13))),
                Row(
                    children: [1, 2, 3, 4, 5]
                        .map((n) => GestureDetector(
                            onTap: () => setState(() => _rating = n),
                            child: Icon(Icons.star,
                                size: 32,
                                color: n <= _rating
                                    ? Colors.amber
                                    : TaifTokens.line)))
                        .toList()),
                const SizedBox(height: 12),
                _field('Comment', _commentCtrl, maxLines: 3),
                const SizedBox(height: 16),
                SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                        onPressed: _submitting ? null : _submitReview,
                        child: Text(
                            _submitting ? 'Submitting...' : 'Submit Review'))),
              ])),
          SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                if (_msg != null) ErrorBanner(message: _msg!),
                _field('Order ID *', _orderIdCtrl),
                _field('Reason *', _disputeReasonCtrl),
                const SizedBox(height: 12),
                _field('Description', _disputeDescCtrl, maxLines: 4),
                const SizedBox(height: 16),
                SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                        onPressed: _submitting ? null : _submitDispute,
                        style: ElevatedButton.styleFrom(
                            backgroundColor: TaifTokens.err),
                        child:
                            Text(_submitting ? 'Opening...' : 'Open Dispute'))),
              ])),
        ]));
  }

  Widget _field(String label, TextEditingController ctrl, {int maxLines = 1}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
              controller: ctrl,
              decoration: InputDecoration(
                  labelText: label,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8))),
              maxLines: maxLines));
}
