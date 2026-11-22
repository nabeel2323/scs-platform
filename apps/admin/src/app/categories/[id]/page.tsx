'use client';

/**
 * Category Detail Page — professional category detail view for Admin.
 *
 * Route: /categories/[id]
 *
 * Consumes the M2 API contracts: `GET /categories/:id` now returns an
 * enriched response (`EnrichedCategory`) with parent/children references and
 * direct/descendant/product-type counts; `GET /categories/:id/products`
 * returns products split by scope; `GET /admin/categories/:id/product-types`
 * returns every status with variant + attribute counts.
 *
 * Task §4 / §6 / §21: the UI must show what products, product types and
 * attributes actually live in a Category, not just its metadata.
 */
import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminRequest, type AdminRecord } from '../../../lib/api';
import {
  fetchCategoryContents,
  fetchCategoryProducts,
  fetchCategoryProductTypesForAdmin,
  fetchProductTypeSchema,
  type EnrichedCategory,
  type CategoryProductRow,
  type AdminCategoryProductTypeRow,
  type ProductTypeSchema,
} from '../../../lib/api';
import { useRequirePerms } from '../../../hooks/useRequirePerms';
import {
  AdminDetailHeader,
  AdminDetailTabs,
  AdminDetailSection,
  AdminKeyValueGrid,
  AdminStatusBadge,
  AdminEntityLink,
  AdminCopyButton,
  AdminLoadingSkeleton,
  AdminErrorState,
  AdminEmptyState,
  formatDate,
  type KVItem,
} from '../../../components/detail';

interface CategoryAttributeRow {
  attributeDefinitionId: string;
  code: string;
  name: string;
  type: string;
  scope: string;
  required: boolean;
  productTypeCount: number;
}

/** Working shape used while folding schemas; `productTypeIds` is dropped in
 *  the final row list rendered by the Attributes tab. */
interface AttributeAccumulator extends CategoryAttributeRow {
  productTypeIds: Set<string>;
}

function CategoryDetailContent({ id }: { id: string }) {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:categories:write']);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<EnrichedCategory | null>(null);
  const [children, setChildren] = useState<AdminRecord[]>([]);
  const [productTypes, setProductTypes] = useState<AdminCategoryProductTypeRow[]>([]);
  const [products, setProducts] = useState<CategoryProductRow[]>([]);
  const [descendantProducts, setDescendantProducts] = useState<CategoryProductRow[]>([]);
  const [attributes, setAttributes] = useState<CategoryAttributeRow[]>([]);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [ptLoading, setPtLoading] = useState(false);
  const [productTypesError, setProductTypesError] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [attributesError, setAttributesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const requestVersion = useRef(0);
  const productTypesRequestVersion = useRef(0);
  const productsRequestVersion = useRef(0);
  const attributesRequestVersion = useRef(0);

  useEffect(() => setReady(true), []);

  const load = useCallback(async () => {
    if (!ready || !hasAccess) return;
    const requestId = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const [cat, childRes] = await Promise.all([
        fetchCategoryContents(id),
        adminRequest<{ data: AdminRecord[]; total: number }>(
          `admin/categories?parentId=${encodeURIComponent(id)}&limit=50&sortBy=name&sortDir=asc`,
        ),
      ]);
      if (requestId === requestVersion.current) {
        setCategory(cat);
        setChildren(childRes?.data || []);
      }
    } catch (err) {
      if (requestId === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Failed to load category');
      }
    } finally {
      if (requestId === requestVersion.current) setLoading(false);
    }
  }, [id, ready, hasAccess]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  // Product Types and Attributes tabs share the admin endpoint that includes DRAFT rows.
  const loadProductTypes = useCallback(async () => {
    if (!id) return;
    const requestId = ++productTypesRequestVersion.current;
    setPtLoading(true);
    setProductTypesError('');
    try {
      const list = await fetchCategoryProductTypesForAdmin(id);
      if (requestId === productTypesRequestVersion.current) setProductTypes(list);
    } catch (err) {
      if (requestId === productTypesRequestVersion.current) {
        setProductTypesError(err instanceof Error ? err.message : 'Failed to load category product types');
      }
    } finally {
      if (requestId === productTypesRequestVersion.current) setPtLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab !== 'productTypes' && activeTab !== 'attributes') return;
    void loadProductTypes();
    return () => { productTypesRequestVersion.current += 1; };
  }, [activeTab, loadProductTypes]);

  // Products tab: direct + descendant split per task §4.
  const loadProducts = useCallback(async () => {
    if (!id) return;
    const requestId = ++productsRequestVersion.current;
    setProductsLoading(true);
    setProductsError('');
    try {
      const result = await fetchCategoryProducts(id, 'BOTH');
      if (requestId === productsRequestVersion.current) {
        setProducts(result.direct);
        setDescendantProducts(result.descendant);
      }
    } catch (err) {
      if (requestId === productsRequestVersion.current) {
        setProductsError(err instanceof Error ? err.message : 'Failed to load category products');
      }
    } finally {
      if (requestId === productsRequestVersion.current) setProductsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab !== 'products') return;
    void loadProducts();
    return () => { productsRequestVersion.current += 1; };
  }, [activeTab, loadProducts]);

  // Attributes are a union of product-type schemas. Treat the operation as
  // complete: a failed schema read must not present a partial union as complete.
  const loadAttributes = useCallback(async () => {
    if (productTypes.length === 0 || productTypesError) return;
    const requestId = ++attributesRequestVersion.current;
    setAttributesLoading(true);
    setAttributesError('');
    try {
      const schemas = await Promise.all(productTypes.map(pt => fetchProductTypeSchema(pt.id)));
      if (requestId !== attributesRequestVersion.current) return;
      const byCode = new Map<string, AttributeAccumulator>();
      schemas.forEach((schema, idx) => {
        const pt = productTypes[idx];
        if (!pt) return;
        for (const attr of schema.attributes ?? []) {
          const key = attr.definition?.code ?? attr.attributeDefinitionId;
          const existing = byCode.get(key);
          if (existing) {
            existing.productTypeIds.add(pt.id);
            existing.productTypeCount = existing.productTypeIds.size;
            if (attr.isRequired) existing.required = true;
            continue;
          }
          byCode.set(key, {
            attributeDefinitionId: attr.attributeDefinitionId,
            code: attr.definition?.code ?? '—',
            name: attr.definition?.name ?? '—',
            type: attr.definition?.type ?? '—',
            scope: attr.definition?.scope ?? '—',
            required: !!attr.isRequired,
            productTypeCount: 1,
            productTypeIds: new Set<string>([pt.id]),
          });
        }
      });
      const rows: CategoryAttributeRow[] = Array.from(byCode.values()).map(row => ({
        attributeDefinitionId: row.attributeDefinitionId,
        code: row.code,
        name: row.name,
        type: row.type,
        scope: row.scope,
        required: row.required,
        productTypeCount: row.productTypeCount,
      }));
      setAttributes(rows);
    } catch (err) {
      if (requestId === attributesRequestVersion.current) {
        setAttributesError(err instanceof Error ? err.message : 'Failed to load product-type attributes');
      }
    } finally {
      if (requestId === attributesRequestVersion.current) setAttributesLoading(false);
    }
  }, [productTypes, productTypesError]);

  useEffect(() => {
    if (activeTab !== 'attributes' || productTypes.length === 0 || productTypesError) return;
    void loadAttributes();
    return () => { attributesRequestVersion.current += 1; };
  }, [activeTab, loadAttributes, productTypes.length, productTypesError]);

  if (!ready) return <AdminLoadingSkeleton kvRows={6} />;
  if (!hasAccess) return <div style={{ padding: 32, color: '#991b1b' }}>Access denied. Required: catalog:categories:write (missing: {missingPerms?.join(', ')})</div>;
  if (loading) return <AdminLoadingSkeleton kvRows={6} />;
  if (error) return <AdminErrorState title="Unable to load category" message={error} onRetry={load} />;
  if (!category) return null;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'hierarchy', label: 'Hierarchy', count: category.children.length },
    { key: 'productTypes', label: 'Product Types', count: category.productTypeCount },
    { key: 'products', label: 'Products', count: category.directProductCount + category.descendantProductCount },
    { key: 'attributes', label: 'Attributes' },
  ];

  const overviewItems: KVItem[] = [
    { key: 'name', label: 'Name (English)', value: category.name || 'Not set' },
    { key: 'nameAr', label: 'Name (Arabic)', value: category.nameAr ? <span dir="rtl">{category.nameAr}</span> : 'Not set' },
    { key: 'slug', label: 'Slug', value: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{category.slug || 'Not set'}</span> },
    { key: 'path', label: 'Full Path', value: <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{category.path || 'Not set'}</span> },
    { key: 'isActive', label: 'Status', value: <AdminStatusBadge status={category.isActive !== false ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'parent', label: 'Parent', value: category.parent ? (
      <AdminEntityLink type="category" id={category.parent.id} name={category.parent.name} />
    ) : 'Root category' },
    { key: 'sortOrder', label: 'Sort Order', value: String(category.sortOrder ?? 0) },
    { key: 'productTypeCount', label: 'Product Types', value: String(category.productTypeCount) },
    { key: 'directProductCount', label: 'Direct Products', value: String(category.directProductCount) },
    { key: 'descendantProductCount', label: 'Descendant Products', value: String(category.descendantProductCount) },
    { key: 'totalProductCount', label: 'Total Products (Direct + Descendant)', value: String(category.directProductCount + category.descendantProductCount) },
    { key: 'storeId', label: 'Scope', value: (category as unknown as { storeId?: string | null }).storeId ? 'Store-scoped' : 'Platform' },
    { key: 'createdAt', label: 'Created', value: formatDate(category.createdAt as string) },
    { key: 'updatedAt', label: 'Updated', value: formatDate(category.updatedAt as string) },
    { key: 'id', label: 'Category ID', value: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>
        <AdminCopyButton value={id} label="" />
      </span>
    )},
  ];

  return (
    <div>
      <AdminDetailHeader
        breadcrumbs={[{ label: 'Catalog', href: '/categories' }, { label: 'Categories', href: '/categories' }]}
        backLabel="Back to Categories"
        backHref="/categories"
        title={category.name || 'Category'}
        subtitle={category.path ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#5b6b74' }}>{category.path}</span> : undefined}
        status={category.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
        entityId={id}
      />

      <AdminDetailTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '0 32px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {activeTab === 'overview' && (
          <AdminDetailSection title="Category Information">
            <AdminKeyValueGrid items={overviewItems} />
          </AdminDetailSection>
        )}

        {activeTab === 'hierarchy' && (
          <>
            {category.parent && (
              <AdminDetailSection title="Parent Category">
                <AdminEntityLink type="category" id={category.parent.id} name={category.parent.name} showIcon />
              </AdminDetailSection>
            )}

            <AdminDetailSection title={`Child Categories (${children.length})`}>
              {children.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {children.map(child => (
                    <Link
                      key={child.id}
                      href={`/categories/${child.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', border: '1px solid #d9e2e6', borderRadius: 8,
                        textDecoration: 'none', color: '#16232b', transition: 'background 0.12s',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 500 }}>{String(child['name'])}</span>
                        {child['slug'] ? <span style={{ marginLeft: 8, fontSize: 12, color: '#5b6b74', fontFamily: 'monospace' }}>{String(child['slug'])}</span> : null}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AdminStatusBadge status={child['isActive'] !== false ? 'ACTIVE' : 'INACTIVE'} />
                        <span style={{ fontSize: 12, color: '#5b6b74' }}>{String(child['productCount'] ?? 0)} products</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <AdminEmptyState title="No child categories" description="This category has no subcategories." />
              )}
            </AdminDetailSection>
          </>
        )}

        {activeTab === 'productTypes' && (
          <AdminDetailSection title={`Product Types (${productTypes.length})`}>
            {ptLoading && <div role="status" style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>Loading product types…</div>}
            {!ptLoading && productTypesError && <AdminErrorState title="Unable to load product types" message={productTypesError} onRetry={loadProductTypes} />}
            {!ptLoading && !productTypesError && productTypes.length === 0 && (
              <AdminEmptyState title="No product types" description="No product types are linked to this category." />
            )}
            {productTypes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {productTypes.map(pt => (
                  <Link
                    key={pt.id}
                    href={`/product-types/${pt.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', border: '1px solid #d9e2e6', borderRadius: 8,
                      textDecoration: 'none', color: '#16232b',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>{pt.name}</span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#5b6b74', fontFamily: 'monospace' }}>{pt.code}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#5b6b74' }}>
                      <AdminStatusBadge status={pt.status} />
                      <span>v{pt.version}</span>
                      <span>{pt.attributeCount} attrs</span>
                      <span>{pt.variantCount} variants</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </AdminDetailSection>
        )}

        {activeTab === 'products' && (
          <>
            <AdminDetailSection title={`Direct Products (${products.length})`}>
              {productsLoading ? (
                <div role="status" style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>Loading products…</div>
              ) : productsError ? (
                <AdminErrorState title="Unable to load category products" message={productsError} onRetry={loadProducts} />
              ) : products.length === 0 ? (
                <AdminEmptyState title="No direct products" description="No products are assigned to this exact category." />
              ) : (
                <ProductTable rows={products} />
              )}
            </AdminDetailSection>

            <AdminDetailSection title={`Descendant Products (${descendantProducts.length})`}>
              {productsLoading ? (
                <div role="status" style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>Loading products…</div>
              ) : productsError ? (
                <AdminErrorState title="Unable to load descendant products" message={productsError} onRetry={loadProducts} />
              ) : descendantProducts.length === 0 ? (
                <AdminEmptyState title="No descendant products" description="No products are assigned to sub-categories." />
              ) : (
                <ProductTable rows={descendantProducts} />
              )}
            </AdminDetailSection>
          </>
        )}

        {activeTab === 'attributes' && (
          <AdminDetailSection title={`Attributes (${attributes.length})`}>
            {productTypesError ? (
              <AdminErrorState title="Unable to load linked product types" message={productTypesError} onRetry={loadProductTypes} />
            ) : attributesLoading ? (
              <div role="status" style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>Loading attributes…</div>
            ) : attributesError ? (
              <AdminErrorState title="Unable to load product-type attributes" message={attributesError} onRetry={loadAttributes} />
            ) : attributes.length === 0 ? (
              <AdminEmptyState
                title="No attributes"
                description="No product-type attributes are linked through this category. Publish a product type first."
              />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#5b6b74', borderBottom: '1px solid #d9e2e6' }}>
                    <th style={{ padding: '8px 12px' }}>Code</th>
                    <th style={{ padding: '8px 12px' }}>Name</th>
                    <th style={{ padding: '8px 12px' }}>Type</th>
                    <th style={{ padding: '8px 12px' }}>Scope</th>
                    <th style={{ padding: '8px 12px' }}>Required</th>
                    <th style={{ padding: '8px 12px' }}>Used in</th>
                  </tr>
                </thead>
                <tbody>
                  {attributes.map(a => (
                    <tr key={a.attributeDefinitionId} style={{ borderBottom: '1px solid #eef2f4' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{a.code}</td>
                      <td style={{ padding: '8px 12px' }}>{a.name}</td>
                      <td style={{ padding: '8px 12px' }}>{a.type}</td>
                      <td style={{ padding: '8px 12px' }}>{a.scope}</td>
                      <td style={{ padding: '8px 12px' }}>{a.required ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '8px 12px' }}>{a.productTypeCount} product type(s)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminDetailSection>
        )}
      </div>
    </div>
  );
}

function ProductTable({ rows }: { rows: CategoryProductRow[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: '#5b6b74', borderBottom: '1px solid #d9e2e6' }}>
          <th style={{ padding: '8px 12px' }}>Title</th>
          <th style={{ padding: '8px 12px' }}>Brand</th>
          <th style={{ padding: '8px 12px' }}>Category</th>
          <th style={{ padding: '8px 12px' }}>Product Type</th>
          <th style={{ padding: '8px 12px' }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderBottom: '1px solid #eef2f4' }}>
            <td style={{ padding: '8px 12px' }}>
              <Link href={`/products/${r.id}`} style={{ color: '#16232b', textDecoration: 'none', fontWeight: 500 }}>
                {r.title}
              </Link>
              {r.slug ? <span style={{ marginLeft: 8, fontSize: 11, color: '#5b6b74', fontFamily: 'monospace' }}>{r.slug}</span> : null}
            </td>
            <td style={{ padding: '8px 12px' }}>{r.brandName ?? '—'}</td>
            <td style={{ padding: '8px 12px' }}>{r.categoryName ?? '—'}</td>
            <td style={{ padding: '8px 12px' }}>{r.productTypeName ?? '—'}</td>
            <td style={{ padding: '8px 12px' }}><AdminStatusBadge status={r.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CategoryDetailPage() {
  const params = useParams();
  const id = params['id'] as string;
  return <Suspense fallback={<AdminLoadingSkeleton kvRows={6} />}><CategoryDetailContent id={id} /></Suspense>;
}
