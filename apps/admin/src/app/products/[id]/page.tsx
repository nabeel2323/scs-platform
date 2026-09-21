'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AccessDenied, useRequirePerms } from '../../../hooks/useRequirePerms';
import ProductDetails from '../../../components/ProductDetails';
import styles from '../../../components/management.module.css';

function ProductPageContent({ id }: { id: string }) {
  const params = useSearchParams();
  const requestedReturn = params.get('returnTo') || '';
  const returnTo = /^\/products(?:\?[^#]*)?$/.test(requestedReturn) ? requestedReturn : '/products';
  const { hasAccess, missingPerms } = useRequirePerms(['admin:merchants:read']);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <p>Loading product…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={['admin:merchants:read']} missingPerms={missingPerms} />;
  return <main className={styles['shell']}>
    <header className={styles['header']}><h1>Product details</h1></header>
    <div className={styles['content']}><Link href={returnTo}>← Back to products</Link>
      <ProductDetails key={id} id={id} fullPage returnTo={returnTo} />
    </div>
  </main>;
}

export default function ProductPage({ params }: { params: { id: string } }) {
  return <Suspense fallback={<p>Loading product…</p>}><ProductPageContent id={params.id} /></Suspense>;
}
