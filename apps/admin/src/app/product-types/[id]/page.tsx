'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ProductTypeSchema, AttributeDefinition,
  fetchProductTypeSchema, fetchAttributes,
  setProductTypeAttributes, setVariantDimensions, publishProductType,
} from '../../../lib/api';
import { useRequirePerms, AccessDenied } from '../../../hooks/useRequirePerms';
import { AttributeTree, AttributeConfigPanel, VariantDimensionSelector } from '../../../components/product-type-builder';
import styles from '../../../components/management.module.css';

/**
 * Product Type Builder — three-panel layout for configuring a product type's
 * attributes, their display/validation properties, and variant dimensions.
 */
export default function ProductTypeBuilderPage() {
  const { hasAccess, missingPerms } = useRequirePerms(['catalog:product-types:manage']);
  const params = useParams();
  const id = params?.id as string;

  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  // Schema state
  const [schema, setSchema] = useState<ProductTypeSchema | null>(null);
  const [allAttributes, setAllAttributes] = useState<AttributeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Builder working state
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [attrConfigs, setAttrConfigs] = useState<Map<string, ProductTypeSchema['attributes'][0]>>(new Map());
  const [variantDimIds, setVariantDimIds] = useState<Set<string>>(new Set());
  const [selectedAttrId, setSelectedAttrId] = useState<string | null>(null);

  // Dirty tracking
  const [dirty, setDirty] = useState(false);

  // Load schema + all available attributes
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schemaData, allAttrs] = await Promise.all([
        fetchProductTypeSchema(id),
        fetchAttributes(),
      ]);
      setSchema(schemaData);
      setAllAttributes(allAttrs);

      // Initialize working state from schema
      const aIds = new Set(schemaData.attributes.map(a => a.attributeDefinitionId));
      const configs = new Map(schemaData.attributes.map(a => [a.attributeDefinitionId, a]));
      const vDims = new Set(schemaData.variantDimensions ?? []);

      setAssignedIds(aIds);
      setAttrConfigs(configs);
      setVariantDimIds(vDims);
      setDirty(false);
      setSaveSuccess(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load product type schema');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (ready && hasAccess && id) load(); }, [ready, hasAccess, id, load]);

  // Handlers
  const handleAddAttribute = useCallback((attrId: string) => {
    setAssignedIds(prev => {
      const next = new Set(prev);
      next.add(attrId);
      return next;
    });
    // Initialize config with defaults
    const attr = allAttributes.find(a => a.id === attrId);
    if (attr) {
      setAttrConfigs(prev => {
        const next = new Map(prev);
        next.set(attrId, {
          attributeDefinitionId: attrId,
          displayOrder: prev.size,
          isRequired: false,
          isFilterable: false,
          isSearchable: false,
          isComparable: false,
          visibleInListing: true,
          visibleInDetail: true,
          conditionalRules: null,
          validationOverride: null,
          definition: attr,
          options: [],
        });
        return next;
      });
    }
    setDirty(true);
  }, [allAttributes]);

  const handleRemoveAttribute = useCallback((attrId: string) => {
    setAssignedIds(prev => {
      const next = new Set(prev);
      next.delete(attrId);
      return next;
    });
    setAttrConfigs(prev => {
      const next = new Map(prev);
      next.delete(attrId);
      return next;
    });
    // Also remove from variant dimensions if present
    setVariantDimIds(prev => {
      if (!prev.has(attrId)) return prev;
      const next = new Set(prev);
      next.delete(attrId);
      return next;
    });
    if (selectedAttrId === attrId) setSelectedAttrId(null);
    setDirty(true);
  }, [selectedAttrId]);

  const handleConfigChange = useCallback((attrId: string, updates: Partial<ProductTypeSchema['attributes'][0]>) => {
    setAttrConfigs(prev => {
      const next = new Map(prev);
      const existing = next.get(attrId);
      if (existing) {
        next.set(attrId, { ...existing, ...updates });
      }
      return next;
    });
    setDirty(true);
  }, []);

  const handleToggleVariantDimension = useCallback((attrId: string) => {
    setVariantDimIds(prev => {
      const next = new Set(prev);
      if (next.has(attrId)) {
        next.delete(attrId);
      } else {
        next.add(attrId);
      }
      return next;
    });
    setDirty(true);
  }, []);

  // Save attributes configuration
  const handleSaveAttributes = async () => {
    setError(null);
    setSaveSuccess(null);
    try {
      const attrs = Array.from(attrConfigs.entries())
        .filter(([attrId]) => assignedIds.has(attrId))
        .map(([attrId, config], index) => ({
          attributeDefinitionId: attrId,
          displayOrder: config.displayOrder ?? index,
          isRequired: config.isRequired ?? false,
          isFilterable: config.isFilterable ?? false,
          isSearchable: config.isSearchable ?? false,
          isComparable: config.isComparable ?? false,
          visibleInListing: config.visibleInListing ?? true,
          visibleInDetail: config.visibleInDetail ?? true,
        }));
      await setProductTypeAttributes(id, attrs);
      await setVariantDimensions(id, Array.from(variantDimIds));
      setDirty(false);
      setSaveSuccess('Saved successfully');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  // Publish
  const handlePublish = async () => {
    if (!window.confirm('Publish this product type? It will become available for merchants.')) return;
    try {
      // Save first if dirty
      if (dirty) await handleSaveAttributes();
      await publishProductType(id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    }
  };

  // Derived state
  const selectedAttr = useMemo(() => {
    if (!selectedAttrId) return null;
    return allAttributes.find(a => a.id === selectedAttrId) ?? null;
  }, [allAttributes, selectedAttrId]);

  const selectedConfig = useMemo(() => {
    if (!selectedAttrId) return null;
    return attrConfigs.get(selectedAttrId) ?? null;
  }, [attrConfigs, selectedAttrId]);

  if (!ready) return <p style={{ padding: 32 }}>Loading…</p>;
  if (!hasAccess) return <AccessDenied requiredPerms={['catalog:product-types:manage']} missingPerms={missingPerms} />;
  if (loading) return <div style={{ padding: 32 }}>Loading product type schema…</div>;
  if (!schema) return <div style={{ padding: 32 }}><div className={styles['error']}>{error || 'Product type not found'}</div></div>;

  const statusColors: Record<string, { bg: string; fg: string }> = {
    DRAFT: { bg: '#fef3c7', fg: '#92400e' },
    PUBLISHED: { bg: '#dcfce7', fg: '#166534' },
    DEPRECATED: { bg: '#fee2e2', fg: '#991b1b' },
  };
  const sc = statusColors[schema.status] ?? statusColors['DRAFT']!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', color: '#16232b' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        background: 'linear-gradient(135deg, #0c2831, #1e6178)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Product Type Builder</h1>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
              background: sc.bg, color: sc.fg,
            }}>
              {schema.status}
            </span>
            {dirty && <span style={{ fontSize: 11, color: '#fbbf24' }}>Unsaved changes</span>}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.7 }}>
            <code>{schema.code}</code> · v{schema.version}
            {schema.name && ` · ${schema.name}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleSaveAttributes}
            disabled={!dirty}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.3)', cursor: dirty ? 'pointer' : 'not-allowed',
              background: dirty ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: '#fff', opacity: dirty ? 1 : 0.5,
            }}
          >
            Save
          </button>
          {schema.status === 'DRAFT' && (
            <button
              type="button"
              onClick={handlePublish}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: '#22c55e', color: '#fff',
              }}
            >
              Publish
            </button>
          )}
        </div>
      </header>

      {/* Status messages */}
      {error && <div className={styles['error']} style={{ margin: '0 24px' }}>{error}</div>}
      {saveSuccess && <div className={styles['notice']} style={{ margin: '0 24px' }}>{saveSuccess}</div>}

      {/* Three-panel layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Attribute Tree */}
        <div style={{
          width: 300, flexShrink: 0, borderRight: '1px solid #d9e2e6',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <AttributeTree
            allAttributes={allAttributes}
            groups={schema.groups}
            assignedIds={assignedIds}
            selectedId={selectedAttrId}
            onSelect={setSelectedAttrId}
            onAdd={handleAddAttribute}
            onRemove={handleRemoveAttribute}
          />
        </div>

        {/* Center: Config Panel */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedAttr ? (
            <AttributeConfigPanel
              attribute={selectedAttr}
              config={selectedConfig}
              onChange={updates => handleConfigChange(selectedAttr.id, updates)}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <div style={{ textAlign: 'center', color: '#5b6b74' }}>
                <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Select an attribute</p>
                <p style={{ fontSize: 12 }}>
                  Click an assigned attribute on the left to configure its properties, or add new attributes from the available list.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Variant Dimensions */}
        <div style={{
          width: 280, flexShrink: 0, borderLeft: '1px solid #d9e2e6',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <VariantDimensionSelector
            allAttributes={allAttributes}
            assignedIds={assignedIds}
            variantDimensionIds={variantDimIds}
            onToggle={handleToggleVariantDimension}
          />
        </div>
      </div>
    </div>
  );
}
