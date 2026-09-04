'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchProfile,
  updateProfile,
  createOrganization,
  createStore,
  createWarehouse,
  registerDocument,
  submitVerification,
  type UserProfile,
} from '../../../lib/api';
import { getUser } from '../../../lib/auth';

const STEPS = ['Your Profile', 'Business Details', 'Store Info', 'Documents', 'Review & Submit'] as const;
type Step = (typeof STEPS)[number];

const ORG_TYPES = [
  { value: 'WHOLESALER', label: 'Wholesaler' },
  { value: 'RETAILER', label: 'Retailer' },
  { value: 'LOGISTICS', label: 'Logistics Provider' },
] as const;

const COUNTRIES = [
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'KW', label: 'Kuwait' },
  { value: 'BH', label: 'Bahrain' },
  { value: 'OM', label: 'Oman' },
  { value: 'QA', label: 'Qatar' },
] as const;

const DOC_TYPES = [
  { value: 'COMMERCIAL_REG', label: 'Commercial Registration' },
  { value: 'TAX_CERT', label: 'Tax Certificate' },
  { value: 'BANK_LETTER', label: 'Bank Letter' },
  { value: 'NATIONAL_ID', label: 'National ID' },
] as const;

export default function MerchantRegistrationPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Step 1: Profile
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  // Step 2: Business
  const [orgName, setOrgName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [orgType, setOrgType] = useState('WHOLESALER');
  const [country, setCountry] = useState('SA');
  const [taxId, setTaxId] = useState('');

  // Step 3: Store
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [locale, setLocale] = useState('ar');
  const [city, setCity] = useState('');

  // Step 3b: Warehouse (optional)
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseCity, setWarehouseCity] = useState('');
  const [managerName, setManagerName] = useState('');

  // Step 4: Documents
  const [documents, setDocuments] = useState<{ docType: string; fileName: string }[]>([]);
  const [newDocType, setNewDocType] = useState('COMMERCIAL_REG');
  const [newDocName, setNewDocName] = useState('');

  // Created IDs (set during submission flow)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [createdStoreId, setCreatedStoreId] = useState<string | null>(null);

  // Load profile on mount
  useEffect(() => {
    async function loadProfile() {
      try {
        const p = await fetchProfile();
        setProfile(p);
        // Pre-fill name from auth user if available
        const authUser = getUser();
        const authName = authUser?.fullName;
        setFullName(p.fullName !== 'New User' ? p.fullName : (authName && authName !== 'New User' ? authName : ''));
        setEmail(p.email || '');
      } catch {
        // If profile fetch fails, user might not be logged in
        router.push('/auth/login');
      } finally {
        setLoadingProfile(false);
      }
    }
    loadProfile();
  }, [router]);

  function addDocument() {
    if (!newDocName.trim()) return;
    setDocuments([...documents, { docType: newDocType, fileName: newDocName.trim() }]);
    setNewDocName('');
  }

  function removeDocument(idx: number) {
    setDocuments(documents.filter((_, i) => i !== idx));
  }

  async function handleNext() {
    setError(null);

    if (currentStep === 0) {
      // Update profile
      if (!fullName.trim()) { setError('Full name is required'); return; }
      setSubmitting(true);
      try {
        await updateProfile({
          fullName: fullName.trim(),
          email: email.trim() || undefined,
        });
        setCurrentStep(1);
      } catch (err: any) {
        setError(err.message || 'Failed to update profile');
      } finally {
        setSubmitting(false);
      }
    } else if (currentStep === 1) {
      // Create organization
      if (!orgName.trim()) { setError('Business name is required'); return; }
      setSubmitting(true);
      try {
        const org = await createOrganization({
          name: orgName.trim(),
          type: orgType,
          country,
          legalName: legalName.trim() || undefined,
          taxId: taxId.trim() || undefined,
        });
        setCreatedOrgId(org.id);
        setCurrentStep(2);
      } catch (err: any) {
        setError(err.message || 'Failed to create organization');
      } finally {
        setSubmitting(false);
      }
    } else if (currentStep === 2) {
      // Create store + optional warehouse
      if (!displayName.trim()) { setError('Store name is required'); return; }
      if (!createdOrgId) { setError('Organization not created. Go back.'); return; }
      setSubmitting(true);
      try {
        const store = await createStore({
          orgId: createdOrgId,
          displayName: displayName.trim(),
          description: description.trim() || undefined,
          currency,
          locale,
          address: city ? { city } : undefined,
        });
        setCreatedStoreId(store.id);

        // Create warehouse if provided
        if (warehouseName.trim()) {
          await createWarehouse(store.id, {
            name: warehouseName.trim(),
            address: warehouseCity ? { city: warehouseCity } : undefined,
            managerName: managerName.trim() || undefined,
          });
        }
        setCurrentStep(3);
      } catch (err: any) {
        setError(err.message || 'Failed to create store');
      } finally {
        setSubmitting(false);
      }
    } else if (currentStep === 3) {
      // Register documents
      if (documents.length > 0 && createdStoreId && createdOrgId) {
        setSubmitting(true);
        try {
          for (const doc of documents) {
            await registerDocument({
              orgId: createdOrgId,
              storeId: createdStoreId,
              docType: doc.docType,
              fileName: doc.fileName,
              fileSize: 0,
            });
          }
        } catch (err: any) {
          setError(err.message || 'Failed to register documents');
          return;
        } finally {
          setSubmitting(false);
        }
      }
      setCurrentStep(4);
    }
  }

  async function handleSubmit() {
    if (!createdStoreId) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitVerification(createdStoreId);
      router.push('/merchant/success');
    } catch (err: any) {
      setError(err.message || 'Failed to submit for verification');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProfile) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', textAlign: 'center', color: '#5b6b74' }}>
        Loading your profile...
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <Link href="/" style={{ color: '#174a5b', textDecoration: 'none', fontSize: 14, display: 'block', marginBottom: 20 }}>
        &larr; Back to Home
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f3340', marginBottom: 4 }}>
        Merchant Registration
      </h1>
      <p style={{ color: '#5b6b74', marginBottom: 24 }}>
        Register your business on the platform — create an organization, set up your store, and submit for verification.
      </p>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
        {STEPS.map((step, idx) => (
          <div
            key={step}
            style={{
              flex: 1,
              padding: '8px 4px',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: idx === currentStep ? 600 : 400,
              color: idx <= currentStep ? '#174a5b' : '#8a9ba5',
              borderBottom: `3px solid ${idx <= currentStep ? '#174a5b' : '#e0e7eb'}`,
            }}
          >
            {idx + 1}. {step}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#ffebee', color: '#c62828', borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Step 1: Profile */}
      {currentStep === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: '#8a9ba5', fontSize: 13, margin: 0 }}>
            Tell us about yourself. This information will be visible to platform admins.
          </p>
          <Field label="Full Name *">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Ahmed Al-Rashid"
            />
          </Field>
          <Field label="Email Address">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="e.g. ahmed@company.com"
            />
          </Field>
          {profile?.phone && (
            <div style={{ padding: '8px 12px', background: '#f0f7f4', borderRadius: 6, fontSize: 13, color: '#2e7d32' }}>
              Phone: <b>{profile.phone}</b> (verified via OTP)
            </div>
          )}
        </div>
      )}

      {/* Step 2: Business Details */}
      {currentStep === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: '#8a9ba5', fontSize: 13, margin: 0 }}>
            Enter your business information. This will be used for verification and legal compliance.
          </p>
          <Field label="Business Name *">
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Al-Baraka Trading Co."
            />
          </Field>
          <Field label="Legal Name">
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              style={inputStyle}
              placeholder="Official registered name (if different)"
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Business Type *">
              <select value={orgType} onChange={(e) => setOrgType(e.target.value)} style={inputStyle}>
                {ORG_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Country *">
              <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
                {COUNTRIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Tax ID / VAT">
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                style={inputStyle}
                placeholder="Optional"
              />
            </Field>
          </div>
        </div>
      )}

      {/* Step 3: Store Info */}
      {currentStep === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: '#8a9ba5', fontSize: 13, margin: 0 }}>
            Set up your storefront on the platform.
          </p>
          <Field label="Store Name *">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Al-Baraka Wholesale"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Brief description of your store..."
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                <option value="SAR">SAR</option>
                <option value="AED">AED</option>
                <option value="KWD">KWD</option>
                <option value="BHD">BHD</option>
                <option value="OMR">OMR</option>
                <option value="QAR">QAR</option>
              </select>
            </Field>
            <Field label="Locale">
              <select value={locale} onChange={(e) => setLocale(e.target.value)} style={inputStyle}>
                <option value="ar">Arabic</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="City">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Riyadh"
              />
            </Field>
          </div>

          {/* Warehouse (optional) */}
          <div style={{ borderTop: '1px solid #e0e7eb', paddingTop: 14, marginTop: 4 }}>
            <p style={{ color: '#8a9ba5', fontSize: 13, margin: '0 0 10px' }}>
              Optional: Add a warehouse now (you can add more later).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Warehouse Name">
                <input
                  type="text"
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Main Warehouse"
                />
              </Field>
              <Field label="City">
                <input
                  type="text"
                  value={warehouseCity}
                  onChange={(e) => setWarehouseCity(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Jeddah"
                />
              </Field>
            </div>
            <Field label="Manager Name">
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                style={inputStyle}
                placeholder="Optional"
              />
            </Field>
          </div>
        </div>
      )}

      {/* Step 4: Documents */}
      {currentStep === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: '#8a9ba5', fontSize: 13, margin: 0 }}>
            Upload verification documents to speed up the approval process. You can skip and add later.
          </p>

          {documents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {documents.map((doc, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#f8fafb',
                    borderRadius: 6,
                    border: '1px solid #e0e7eb',
                  }}
                >
                  <span style={{ fontSize: 14, color: '#0f3340' }}>
                    <b>{DOC_TYPES.find(d => d.value === doc.docType)?.label || doc.docType}</b>
                    {' — '}{doc.fileName}
                  </span>
                  <button onClick={() => removeDocument(idx)} style={linkBtnStyle}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Document Type">
              <select value={newDocType} onChange={(e) => setNewDocType(e.target.value)} style={inputStyle}>
                {DOC_TYPES.map(dt => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="File Name">
              <input
                type="text"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                style={inputStyle}
                placeholder="e.g. cr_certificate.pdf"
              />
            </Field>
            <button onClick={addDocument} style={{ ...primaryBtnStyle, marginBottom: 0, whiteSpace: 'nowrap' }}>
              Add
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review & Submit */}
      {currentStep === 4 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>Registration Summary</h3>
          <div style={{ background: '#f8fafb', borderRadius: 8, padding: 20, border: '1px solid #e0e7eb', marginBottom: 16 }}>
            <SummaryRow label="Your Name" value={fullName} />
            {email && <SummaryRow label="Email" value={email} />}
            <div style={{ height: 8 }} />
            <SummaryRow label="Business" value={orgName} />
            {legalName && <SummaryRow label="Legal Name" value={legalName} />}
            <SummaryRow label="Type" value={ORG_TYPES.find(t => t.value === orgType)?.label || orgType} />
            <SummaryRow label="Country" value={COUNTRIES.find(c => c.value === country)?.label || country} />
            {taxId && <SummaryRow label="Tax ID" value={taxId} />}
            <div style={{ height: 8 }} />
            <SummaryRow label="Store" value={displayName} />
            <SummaryRow label="Currency" value={currency} />
            <SummaryRow label="Locale" value={locale} />
            {city && <SummaryRow label="City" value={city} />}
            {warehouseName && <SummaryRow label="Warehouse" value={warehouseName} />}
            <SummaryRow label="Documents" value={`${documents.length} file(s)`} />
          </div>
          <div style={{ padding: '12px 16px', background: '#e3f2fd', borderRadius: 6, color: '#1565c0', fontSize: 14, marginBottom: 8 }}>
            By submitting, your store will be queued for platform verification.
            An admin will review your application and approve or request changes.
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
        {currentStep > 0 ? (
          <button onClick={() => setCurrentStep(currentStep - 1)} style={secondaryBtnStyle}>
            &larr; Previous
          </button>
        ) : <div />}

        {currentStep < 4 ? (
          <button onClick={handleNext} disabled={submitting} style={primaryBtnStyle}>
            {submitting ? 'Processing...' : 'Next →'}
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} style={{
            ...primaryBtnStyle,
            background: submitting ? '#8a9ba5' : '#2e7d32',
          }}>
            {submitting ? 'Submitting...' : 'Submit for Verification'}
          </button>
        )}
      </div>
    </main>
  );
}

// ── Shared styles ────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #d9e2e6',
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 28px',
  borderRadius: 6,
  border: 'none',
  background: '#174a5b',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 28px',
  borderRadius: 6,
  border: '1px solid #d9e2e6',
  background: '#fff',
  color: '#5b6b74',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#c62828',
  cursor: 'pointer',
  fontSize: 13,
  padding: '2px 8px',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 13, color: '#5b6b74', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eef2f4' }}>
      <span style={{ color: '#8a9ba5', fontSize: 14 }}>{label}</span>
      <span style={{ color: '#0f3340', fontSize: 14, fontWeight: 500 }}>{value}</span>
    </div>
  );
}
