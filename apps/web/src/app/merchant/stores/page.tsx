import { redirect } from 'next/navigation';

/** Backward-compatible plural route; the canonical store profile is /merchant/store. */
export default function MerchantStoresRedirectPage() {
  redirect('/merchant/store');
}
