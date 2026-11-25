export interface CheckoutCurrencyItem {
  lineTotalMinor: number;
  currency?: string | null;
}

export interface CheckoutCurrencySelection {
  fulfillmentMethod?: string | null;
  shippingMethodId?: string | null;
  estimate?: {
    methods: Array<{
      methodId: string;
      feeMinor: number;
      currency?: string | null;
    }>;
  } | null;
}

export interface CheckoutCurrencyTotals {
  totalsByCurrency: Record<string, number>;
  hasUnpricedAmounts: boolean;
}

/**
 * Sum checkout amounts only within their own ISO currency. Missing currencies
 * are tracked rather than silently defaulted (for example, to SAR).
 */
export function computeCheckoutTotalsByCurrency(
  items: CheckoutCurrencyItem[],
  selections: CheckoutCurrencySelection[],
): CheckoutCurrencyTotals {
  const totalsByCurrency: Record<string, number> = {};
  let hasUnpricedAmounts = false;

  const add = (amountMinor: number, currency?: string | null) => {
    const normalizedCurrency = currency?.trim().toUpperCase();
    if (!normalizedCurrency) {
      hasUnpricedAmounts = true;
      return;
    }
    totalsByCurrency[normalizedCurrency] =
      (totalsByCurrency[normalizedCurrency] ?? 0) + amountMinor;
  };

  for (const item of items) add(item.lineTotalMinor, item.currency);

  for (const selection of selections) {
    if (selection.fulfillmentMethod === 'PICKUP' || !selection.shippingMethodId) continue;
    const method = selection.estimate?.methods.find(
      (candidate) => candidate.methodId === selection.shippingMethodId,
    );
    if (method) add(method.feeMinor, method.currency);
  }

  return { totalsByCurrency, hasUnpricedAmounts };
}
