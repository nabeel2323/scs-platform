'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AccessDenied, useRequirePerms } from '../../../hooks/useRequirePerms';
import ProductDetails from '../../../components/ProductDetails';
import { AdminLoadingSkeleton } from '../../../components/detail';

function ProductPageContent({ id }: { id: string }) {
  const params = useSearchParams();
  const requestedReturn = params.get('returnTo') || '';
  const returnTo = /^\/products(?:\?[^#]*)?$/.test(requestedReturn) ? requestedReturn : '/products';
  const { hasAccess, missingPerms } = useRequirePerms(['admin:merchants:read']);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <AdminLoadingSkeleton kvRows={8} showTable />;
  if (!hasAccess) return <AccessDenied requiredPerms={['admin:merchants:read']} missingPerms={missingPerms} />;
  return (
    <div>
      <ProductDetails key={id} id={id} fullPage returnTo={returnTo} />
    </div>
  );
}

export default function ProductPage({ params }: { params: { id: string } }) {
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={8} showTable />}><ProductPageContent id={params.id} /></Suspense>;
}
