import { redirect } from 'next/navigation';

/**
 * Backwards-compatible route alias.
 *
 * The merchant navigation and canonical store profile live at /merchant/store.
 * Older links and prefetched URLs may still target /merchant/stores.
 */
export default function MerchantStoresAliasPage(): never {
  redirect('/merchant/store');
}
