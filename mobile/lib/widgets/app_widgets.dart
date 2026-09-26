import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../core/theme.dart';
import '../models/models.dart';

/// Phase 1 design-system primitives (spec §Phase 1). These wrap [TaifTokens] +
/// [AppTypography] so later phases stop hand-styling buttons/inputs/images and
/// get consistent busy/disabled/error/loading behaviour for free.
///
/// Nothing here changes business logic — they are presentation building blocks.

// ── AppButton ──────────────────────────────────────────────────────

enum AppButtonVariant { primary, secondary, ghost, danger }

/// Standardized button with first-class `loading` (busy) and disabled states so
/// every mutation can prevent double-submission the same way (spec §41).
class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool loading;
  final bool expanded;

  /// Compact 36dp height for dense rows (e.g. offer cards) vs the 48dp default.
  final bool dense;
  final IconData? icon;

  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.loading = false,
    this.expanded = false,
    this.dense = false,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    final onDark = variant == AppButtonVariant.primary ||
        variant == AppButtonVariant.danger;
    final fg = onDark ? Colors.white : TaifTokens.brandPrimary;

    final content = loading
        ? SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: dense ? 16 : 18),
                const SizedBox(width: 8),
              ],
              Text(label),
            ],
          );

    final Size? minSize = dense ? const Size(0, 36) : null;
    final EdgeInsetsGeometry? pad =
        dense ? const EdgeInsets.symmetric(horizontal: 12) : null;
    final TextStyle? textStyle = dense
        ? const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)
        : null;

    final Widget button = switch (variant) {
      AppButtonVariant.primary => ElevatedButton(
          onPressed: enabled ? onPressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: TaifTokens.brandPrimary,
            foregroundColor: Colors.white,
            minimumSize: minSize,
            padding: pad,
            textStyle: textStyle,
            disabledBackgroundColor:
                TaifTokens.brandPrimary.withAlpha(loading ? 210 : 90),
            disabledForegroundColor:
                Colors.white.withAlpha(loading ? 235 : 170),
          ),
          child: content,
        ),
      AppButtonVariant.danger => ElevatedButton(
          onPressed: enabled ? onPressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: TaifTokens.err,
            foregroundColor: Colors.white,
            minimumSize: minSize,
            padding: pad,
            textStyle: textStyle,
            disabledBackgroundColor:
                TaifTokens.err.withAlpha(loading ? 210 : 90),
            disabledForegroundColor:
                Colors.white.withAlpha(loading ? 235 : 170),
          ),
          child: content,
        ),
      AppButtonVariant.secondary => OutlinedButton(
          onPressed: enabled ? onPressed : null,
          style: OutlinedButton.styleFrom(
            foregroundColor: TaifTokens.brandPrimary,
            minimumSize: minSize,
            padding: pad,
            textStyle: textStyle,
            side: BorderSide(
                color: enabled ? TaifTokens.brandPrimary : TaifTokens.line),
          ),
          child: content,
        ),
      AppButtonVariant.ghost => TextButton(
          onPressed: enabled ? onPressed : null,
          style: TextButton.styleFrom(
            foregroundColor: TaifTokens.brandPrimary,
            minimumSize: minSize,
            padding: pad,
            textStyle: textStyle,
          ),
          child: content,
        ),
    };

    return expanded ? SizedBox(width: double.infinity, child: button) : button;
  }
}

// ── AppTextField ───────────────────────────────────────────────────

/// Consistent text input relying on the themed [InputDecorationTheme]; adds a
/// label/hint/helper/error + optional icons without per-screen re-styling.
class AppTextField extends StatelessWidget {
  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final String? helper;
  final String? errorText;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final int maxLines;
  final bool enabled;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  const AppTextField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.helper,
    this.errorText,
    this.prefixIcon,
    this.suffixIcon,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.maxLines = 1,
    this.enabled = true,
    this.onChanged,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        textInputAction: textInputAction,
        maxLines: obscureText ? 1 : maxLines,
        enabled: enabled,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: helper,
          errorText: errorText,
          prefixIcon: prefixIcon != null ? Icon(prefixIcon, size: 20) : null,
          suffixIcon: suffixIcon,
        ),
      );
}

// ── Skeletons (shimmer) ────────────────────────────────────────────

/// Shimmer wrapper — the single place base/highlight colours are defined.
class AppSkeleton extends StatelessWidget {
  final Widget child;
  const AppSkeleton({super.key, required this.child});

  @override
  Widget build(BuildContext context) => Shimmer.fromColors(
        baseColor: const Color(0xFFE3E9EC),
        highlightColor: const Color(0xFFF7FAFB),
        child: child,
      );
}

/// A single shimmering block. Defaults to full width so it drops into Columns.
class AppSkeletonBox extends StatelessWidget {
  final double width;
  final double height;
  final double radius;
  const AppSkeletonBox({
    super.key,
    this.width = double.infinity,
    this.height = 12,
    this.radius = 6,
  });

  @override
  Widget build(BuildContext context) => AppSkeleton(
        child: Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(radius),
          ),
        ),
      );
}

/// Shimmering multi-line text placeholder.
class AppSkeletonText extends StatelessWidget {
  final int lines;
  const AppSkeletonText({super.key, this.lines = 2});

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: List.generate(
          lines,
          (i) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AppSkeletonBox(
                width: i == lines - 1 ? 140 : double.infinity, height: 12),
          ),
        ),
      );
}

/// Card-shaped skeleton matching [ProductCard]'s layout, so grid/list loading
/// shows the real shape instead of a bare spinner (spec §38).
class AppSkeletonProductCard extends StatelessWidget {
  const AppSkeletonProductCard({super.key});

  @override
  Widget build(BuildContext context) => const Card(
        child: Padding(
          padding: EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppSkeletonBox(height: 120, radius: 6),
              SizedBox(height: 10),
              AppSkeletonBox(height: 13),
              SizedBox(height: 6),
              AppSkeletonBox(width: 90, height: 13),
              SizedBox(height: 6),
              AppSkeletonBox(width: 60, height: 11),
            ],
          ),
        ),
      );
}

// ── AppNetworkImage ────────────────────────────────────────────────

/// Cached network image with a shimmer placeholder and a graceful fallback, so
/// a 404 or slow load never leaves a red exception box (replaces raw
/// `Image.network` across the app).
class AppNetworkImage extends StatelessWidget {
  final String? url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final double radius;
  final IconData fallbackIcon;

  const AppNetworkImage({
    super.key,
    this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.radius = 0,
    this.fallbackIcon = Icons.inventory_2_outlined,
  });

  @override
  Widget build(BuildContext context) {
    final u = url;
    Widget inner;
    if (u == null || u.isEmpty) {
      inner = _fallback();
    } else {
      inner = CachedNetworkImage(
        imageUrl: u,
        width: width,
        height: height,
        fit: fit,
        placeholder: (_, __) => AppSkeleton(
          child: Container(width: width, height: height, color: Colors.white),
        ),
        errorWidget: (_, __, ___) => _fallback(),
      );
    }
    if (radius > 0) {
      inner =
          ClipRRect(borderRadius: BorderRadius.circular(radius), child: inner);
    }
    return inner;
  }

  Widget _fallback() => Container(
        width: width,
        height: height,
        color: TaifTokens.bg,
        child: Center(child: Icon(fallbackIcon, color: TaifTokens.muted)),
      );
}

// ── AppErrorState ──────────────────────────────────────────────────

/// Full-panel error state. Pair with `ApiService.errorMessage(e)` so every
/// failure shows a human message + optional retry (spec §40).
class AppErrorState extends StatelessWidget {
  final String title;
  final String message;
  final VoidCallback? onRetry;
  final IconData icon;

  const AppErrorState({
    super.key,
    this.title = 'Something went wrong',
    required this.message,
    this.onRetry,
    this.icon = Icons.error_outline,
  });

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 56, color: TaifTokens.err),
            const SizedBox(height: 16),
            Text(title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: TaifTokens.muted)),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              AppButton(
                label: 'Retry',
                icon: Icons.refresh,
                variant: AppButtonVariant.secondary,
                onPressed: onRetry,
              ),
            ],
          ]),
        ),
      );
}

// ── AppOfferCard ───────────────────────────────────────────────────

/// One merchant offer in a PDP comparison list (spec §20): seller + verified
/// badge, MOQ/lead time, price, and an add action. Purely presentational — the
/// caller owns ranking/sort/add logic.
class AppOfferCard extends StatelessWidget {
  final Offer offer;
  final bool isPopular;
  final bool added;
  final VoidCallback? onAdd;

  const AppOfferCard({
    super.key,
    required this.offer,
    this.isPopular = false,
    this.added = false,
    this.onAdd,
  });

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isPopular ? const Color(0xFFFFFDF5) : TaifTokens.surface,
          border: Border.all(
              color: isPopular ? TaifTokens.brandAccent : TaifTokens.line),
          borderRadius: BorderRadius.circular(TaifTokens.radiusMd),
        ),
        child: Row(children: [
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text(offer.storeName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 14)),
                ),
                if (offer.storeVerified)
                  const Padding(
                    padding: EdgeInsets.only(left: 4),
                    child: Icon(Icons.verified, size: 14, color: TaifTokens.ok),
                  ),
                if (isPopular)
                  Container(
                    margin: const EdgeInsets.only(left: 6),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                        color: TaifTokens.brandAccent,
                        borderRadius: BorderRadius.circular(4)),
                    child: const Text('★ #1',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Colors.white)),
                  ),
              ]),
              const SizedBox(height: 4),
              Text(
                  'MOQ: ${offer.moq}${offer.leadTimeDays != null ? ' · ${offer.leadTimeDays}d lead' : ''}',
                  style:
                      const TextStyle(fontSize: 12, color: TaifTokens.muted)),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatMinor(offer.basePriceMinor, offer.currency),
                style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: TaifTokens.brandPrimary)),
            const SizedBox(height: 6),
            AppButton(
              label: added ? 'Added' : 'Add',
              dense: true,
              icon: added ? Icons.check : Icons.add,
              onPressed: onAdd,
            ),
          ]),
        ]),
      );
}
