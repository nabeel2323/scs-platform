'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchMyStores } from '../../../lib/api';
import { pickStore } from '../../../lib/merchant-store';
import {
  fetchShippingMethods, createShippingMethod, updateShippingMethod,
  deactivateShippingMethod, fetchDeliveryZones, createDeliveryZone,
  updateDeliveryZone, attachMethodToZone, detachMethodFromZone,
  ShippingMethod, DeliveryZone,
} from '../../../lib/buyer-api';
import { LoadingSpinner, ErrorBanner, EmptyState } from '../../../components/Shared';
import {
  PageHeader, Card, Button, TextInput, Select,
  colors, typeScale, radii,
} from '@scs/ui-kit';

export default function MerchantShippingPage() {
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Shipping methods
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [showMethodForm, setShowMethodForm] = useState(false);
  const [mKey, setMKey] = useState('');
  const [mName, setMName] = useState('');
  const [mFulfillment, setMFulfillment] = useState('PLATFORM_DELIVERY');
  const [mBaseFee, setMBaseFee] = useState('0');
  const [mMinOrder, setMMinOrder] = useState('');
  const [mFreeAbove, setMFreeAbove] = useState('');
  const [mDaysMin, setMDaysMin] = useState('');
  const [mDaysMax, setMDaysMax] = useState('');
  const [mDesc, setMDesc] = useState('');

  // Zones
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zName, setZName] = useState('');
  const [zCity, setZCity] = useState('');
  const [zPostal, setZPostal] = useState('');
  const [zCountry, setZCountry] = useState('SA');

  // Edit forms
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBaseFee, setEditBaseFee] = useState('');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState('');

  // Zone-method associations
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const [zoneMethods, setZoneMethods] = useState<Record<string, ShippingMethod[]>>({});

  useEffect(() => {
    fetchMyStores()
      .then((ss) => {
        setStores(ss);
        const picked = pickStore(ss);
        if (picked) setStoreId(picked.id);
      })
      .catch(() => setError('Failed to load stores'))
      .finally(() => setLoading(false));
  }, []);

  const loadMethods = useCallback(async () => {
    if (!storeId) return;
    try { setMethods(await fetchShippingMethods(storeId)); } catch { /* non-fatal */ }
  }, [storeId]);

  const loadZones = useCallback(async () => {
    if (!storeId) return;
    try { setZones(await fetchDeliveryZones(storeId)); } catch { /* non-fatal */ }
  }, [storeId]);

  useEffect(() => { loadMethods(); loadZones(); }, [loadMethods, loadZones]);

  const handleCreateMethod = async () => {
    setError('');
    try {
      await createShippingMethod({
        storeId, key: mKey, name: mName, fulfillmentMethod: mFulfillment,
        baseFeeMinor: parseInt(mBaseFee) || 0,
        description: mDesc || undefined,
        minOrderMinor: mMinOrder ? parseInt(mMinOrder) : undefined,
        freeAboveMinor: mFreeAbove ? parseInt(mFreeAbove) : undefined,
        estimatedDaysMin: mDaysMin ? parseInt(mDaysMin) : undefined,
        estimatedDaysMax: mDaysMax ? parseInt(mDaysMax) : undefined,
      });
      setShowMethodForm(false);
      setMKey(''); setMName(''); setMBaseFee('0'); setMMinOrder(''); setMFreeAbove('');
      setMDaysMin(''); setMDaysMax(''); setMDesc('');
      await loadMethods();
    } catch (e: any) { setError(e.message || 'Failed to create method'); }
  };

  const handleToggleActive = async (m: ShippingMethod) => {
    try {
      if (m.isActive) await deactivateShippingMethod(m.id);
      else await updateShippingMethod(m.id, { isActive: true });
      await loadMethods();
    } catch (e: any) { setError(e.message || 'Toggle failed'); }
  };

  const handleStartEditMethod = (m: ShippingMethod) => {
    setEditingMethodId(m.id);
    setEditName(m.name);
    setEditBaseFee(String(m.baseFeeMinor));
  };

  const handleSaveEditMethod = async () => {
    if (!editingMethodId) return;
    try {
      await updateShippingMethod(editingMethodId, { name: editName, baseFeeMinor: parseInt(editBaseFee) || 0 });
      setEditingMethodId(null);
      await loadMethods();
    } catch (e: any) { setError(e.message || 'Update failed'); }
  };

  const handleStartEditZone = (z: DeliveryZone) => {
    setEditingZoneId(z.id);
    setEditZoneName(z.name);
  };

  const handleSaveEditZone = async () => {
    if (!editingZoneId) return;
    try {
      await updateDeliveryZone(editingZoneId, { name: editZoneName });
      setEditingZoneId(null);
      await loadZones();
    } catch (e: any) { setError(e.message || 'Update failed'); }
  };

  const handleToggleZoneExpand = async (z: DeliveryZone) => {
    if (expandedZoneId === z.id) { setExpandedZoneId(null); return; }
    setExpandedZoneId(z.id);
    // Zone methods are loaded on demand via the API
  };

  const handleAttachMethod = async (zoneId: string, methodId: string) => {
    try {
      await attachMethodToZone(zoneId, methodId);
    } catch (e: any) { setError(e.message || 'Attach failed'); }
  };

  const handleDetachMethod = async (zoneId: string, methodId: string) => {
    try {
      await detachMethodFromZone(zoneId, methodId);
    } catch (e: any) { setError(e.message || 'Detach failed'); }
  };

  const handleCreateZone = async () => {
    setError('');
    try {
      await createDeliveryZone({ storeId, name: zName, city: zCity || undefined, postalCode: zPostal || undefined, country: zCountry });
      setShowZoneForm(false); setZName(''); setZCity(''); setZPostal('');
      await loadZones();
    } catch (e: any) { setError(e.message || 'Failed to create zone'); }
  };

  const handleToggleZone = async (z: DeliveryZone) => {
    try {
      await updateDeliveryZone(z.id, { isActive: !z.isActive });
      await loadZones();
    } catch (e: any) { setError(e.message || 'Toggle failed'); }
  };

  if (loading) return <LoadingSpinner />;
  if (!storeId) return <EmptyState title="No store found" description="Create a store first." />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="Shipping Settings" subtitle="Manage delivery methods, pricing and zones" />
      <div style={{ padding: '20px 24px 48px' }}>
        {error && <ErrorBanner message={error} />}

        {stores.length > 1 && (
          <Select label="Store" value={storeId} onChange={e => setStoreId(e.target.value)}
            options={stores.map((s: any) => ({ value: s.id, label: s.name || s.id.slice(0, 8) }))}
            style={{ marginBottom: 20 }} />
        )}

        {/* Shipping Methods */}
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ ...typeScale.h3, color: colors.brand[700], margin: 0 }}>Shipping Methods</h2>
            <Button size="sm" onClick={() => setShowMethodForm(!showMethodForm)}>
              {showMethodForm ? 'Cancel' : '+ Add Method'}
            </Button>
          </div>

          {showMethodForm && (
            <div style={{ background: colors.bgSubtle, padding: 16, borderRadius: radii.sm, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextInput label="Key *" value={mKey} onChange={e => setMKey(e.target.value)} placeholder="standard" />
                <TextInput label="Name *" value={mName} onChange={e => setMName(e.target.value)} placeholder="Standard Delivery" />
                <Select label="Fulfillment" value={mFulfillment} onChange={e => setMFulfillment(e.target.value)}
                  options={[{ value: 'PLATFORM_DELIVERY', label: 'Platform' }, { value: 'MERCHANT_DELIVERY', label: 'Merchant' }, { value: 'PICKUP', label: 'Pickup' }]} />
                <TextInput label="Base Fee (halalas) *" value={mBaseFee} onChange={e => setMBaseFee(e.target.value)} type="number" />
                <TextInput label="Min Order (halalas)" value={mMinOrder} onChange={e => setMMinOrder(e.target.value)} type="number" />
                <TextInput label="Free Above (halalas)" value={mFreeAbove} onChange={e => setMFreeAbove(e.target.value)} type="number" />
                <TextInput label="Est. Days Min" value={mDaysMin} onChange={e => setMDaysMin(e.target.value)} type="number" />
                <TextInput label="Est. Days Max" value={mDaysMax} onChange={e => setMDaysMax(e.target.value)} type="number" />
              </div>
              <TextInput label="Description" value={mDesc} onChange={e => setMDesc(e.target.value)} placeholder="Optional description" style={{ marginTop: 12 }} />
              <Button size="sm" onClick={handleCreateMethod} style={{ marginTop: 12 }}>Create Method</Button>
            </div>
          )}

          {methods.length === 0 ? (
            <p style={{ ...typeScale.body, color: colors.muted }}>No shipping methods configured.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {methods.map(m => (
                <div key={m.id} style={{ padding: '10px 12px', border: `1px solid ${colors.borderLight}`, borderRadius: radii.sm }}>
                  {editingMethodId === m.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <TextInput label="Name" value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1 }} />
                      <TextInput label="Base Fee" value={editBaseFee} onChange={e => setEditBaseFee(e.target.value)} type="number" style={{ width: 100 }} />
                      <Button size="sm" onClick={handleSaveEditMethod}>Save</Button>
                      <Button size="sm" onClick={() => setEditingMethodId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ ...typeScale.body, fontWeight: 600 }}>
                          {m.name} <span style={{ color: colors.muted, fontWeight: 400 }}>— {m.key || m.type}</span>
                        </div>
                        <div style={{ ...typeScale.bodySm, color: colors.muted }}>
                          Fee: {m.baseFeeMinor} halalas | {m.fulfillmentMethod} | {m.carrierType}
                          {m.minOrderMinor != null && ` | Min: ${m.minOrderMinor}`}
                          {m.freeAboveMinor != null && ` | Free above: ${m.freeAboveMinor}`}
                          {m.estimatedDaysMin != null && ` | ${m.estimatedDaysMin}–${m.estimatedDaysMax} days`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...typeScale.bodySm, color: m.isActive ? colors.ok : colors.muted }}>
                          {m.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <Button size="sm" onClick={() => handleStartEditMethod(m)}>Edit</Button>
                        <Button size="sm" onClick={() => handleToggleActive(m)}>
                          {m.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Delivery Zones */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ ...typeScale.h3, color: colors.brand[700], margin: 0 }}>Delivery Zones</h2>
            <Button size="sm" onClick={() => setShowZoneForm(!showZoneForm)}>
              {showZoneForm ? 'Cancel' : '+ Add Zone'}
            </Button>
          </div>

          {showZoneForm && (
            <div style={{ background: colors.bgSubtle, padding: 16, borderRadius: radii.sm, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextInput label="Name *" value={zName} onChange={e => setZName(e.target.value)} placeholder="Riyadh Zone" />
                <TextInput label="City" value={zCity} onChange={e => setZCity(e.target.value)} placeholder="Riyadh" />
                <TextInput label="Postal Code" value={zPostal} onChange={e => setZPostal(e.target.value)} placeholder="12345" />
                <TextInput label="Country" value={zCountry} onChange={e => setZCountry(e.target.value)} placeholder="SA" />
              </div>
              <Button size="sm" onClick={handleCreateZone} style={{ marginTop: 12 }}>Create Zone</Button>
            </div>
          )}

          {zones.length === 0 ? (
            <p style={{ ...typeScale.body, color: colors.muted }}>No delivery zones configured. All addresses are served by default.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {zones.map(z => (
                <div key={z.id} style={{ border: `1px solid ${colors.borderLight}`, borderRadius: radii.sm }}>
                  {editingZoneId === z.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px' }}>
                      <TextInput label="Zone Name" value={editZoneName} onChange={e => setEditZoneName(e.target.value)} style={{ flex: 1 }} />
                      <Button size="sm" onClick={handleSaveEditZone}>Save</Button>
                      <Button size="sm" onClick={() => setEditingZoneId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
                        <div>
                          <div style={{ ...typeScale.body, fontWeight: 600 }}>{z.name}</div>
                          <div style={{ ...typeScale.bodySm, color: colors.muted }}>
                            {[z.city, z.region, z.postalCode, z.country].filter(Boolean).join(', ') || 'Country-wide'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ ...typeScale.bodySm, color: z.isActive ? colors.ok : colors.muted }}>
                            {z.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <Button size="sm" onClick={() => handleStartEditZone(z)}>Edit</Button>
                          <Button size="sm" onClick={() => handleToggleZoneExpand(z)}>
                            {expandedZoneId === z.id ? 'Hide Methods' : 'Methods'}
                          </Button>
                          <Button size="sm" onClick={() => handleToggleZone(z)}>
                            {z.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </div>
                      {expandedZoneId === z.id && (
                        <div style={{ padding: '8px 12px 12px', background: colors.bgSubtle, borderTop: `1px solid ${colors.borderLight}` }}>
                          <div style={{ ...typeScale.bodySm, fontWeight: 600, marginBottom: 8 }}>Available methods for this zone:</div>
                          {methods.filter(m => m.isActive).length === 0 ? (
                            <p style={{ ...typeScale.bodySm, color: colors.muted }}>No active methods available.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {methods.filter(m => m.isActive).map(m => (
                                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
                                  <span style={{ ...typeScale.bodySm }}>{m.name}</span>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <Button size="sm" onClick={() => handleAttachMethod(z.id, m.id)}>Attach</Button>
                                    <Button size="sm" onClick={() => handleDetachMethod(z.id, m.id)}>Detach</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
