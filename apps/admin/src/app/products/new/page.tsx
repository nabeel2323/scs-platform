'use client';

import { Suspense, useState, useEffect } from 'react';
import { AccessDenied, useRequirePerms } from '../../../hooks/useRequirePerms';
import { AdminLoadingSkeleton } from '../../../components/detail';
import ProductForm from '../../../components/product-editor/ProductForm';

function NewProductContent() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:products:write']);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <AdminLoadingSkeleton kvRows={8} />;
  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:products:write']} missingPerms={missingPerms} />;
  return <ProductForm mode="create" />;
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<AdminLoadingSkeleton kvRows={8} />}>
      <NewProductContent />
    </Suspense>
  );
}
