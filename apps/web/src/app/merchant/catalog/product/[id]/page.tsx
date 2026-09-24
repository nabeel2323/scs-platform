'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingSpinner } from '../../../../../components/Shared';

/**
 * Legacy Product Editor — REDIRECTED.
 *
 * The old monolithic product editor at /merchant/catalog/product/:id has been
 * superseded by the Product Studio wizard at /merchant/product-studio.
 *
 * - /merchant/catalog/product/new  → /merchant/product-studio (create flow)
 * - /merchant/catalog/product/:id  → /merchant/catalog (edit removed; Product
 *   Studio edit mode will be added in a future iteration)
 *
 * The old form wrote offer-owned fields (moq, isAvailable) directly on the
 * canonical products table, bypassing the Merchant Offer model. Those writes
 * are no longer accepted by the backend DTOs.
 */
export default function LegacyProductEditorRedirect() {
  const params = useParams();
  const router = useRouter();
  const rawId = String(params?.['id'] || '');
  const isNew = rawId === 'new';

  useEffect(() => {
    if (isNew) {
      router.replace('/merchant/product-studio');
    } else {
      router.replace('/merchant/catalog');
    }
  }, [isNew, router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <LoadingSpinner />
        <p style={{ marginTop: 16, fontSize: 14, color: '#5b6b74' }}>
          {isNew
            ? 'Redirecting to Product Studio…'
            : 'Redirecting to Catalog…'}
        </p>
      </div>
    </div>
  );
}
