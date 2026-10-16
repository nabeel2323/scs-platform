'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useProductStudioEdit, EditLoadStatus } from '../../../../../hooks/useProductStudioEdit';
import { type Step, type StudioState, STEPS } from '../../../../../hooks/useProductStudio';
import { ProductTypeSummary, fetchProductTypes, submitProductForReview, withdrawProductFromReview, publishProduct, unpublishProduct } from '../../../../../lib/buyer-api';
import { PageHeader } from '@scs/ui-kit';
import ProgressIndicator from '../../components/ProgressIndicator';
import StepIdentity from '../../steps/StepIdentity';
import StepSpecifications from '../../steps/StepSpecifications';
import StepVariants from '../../steps/StepVariants';
import StepMedia from '../../steps/StepMedia';
import StepReview from '../../steps/StepReview';

/** Edit-mode steps: skip the offer step (P6 does not edit offers). */
const EDIT_STEPS = STEPS.filter((s: { key: Step }) => s.key !== 'offer');

export default function ProductStudioEditPage() {
  const router = useRouter();
  const params = useParams();
  const productId = (params as Record<string, string>)?.['id'] ?? '';
  const studio = useProductStudioEdit(productId);
  const {
    step, setStep, stepIndex, state, setState,
    stores, categories, brands,
    error, setError, saving, success, setSuccess,
    loadStatus, loadError,
    conflict, handleReload, handleDiscard,
    isDirty,
    existingVariants,
    existingMedia,
    variantAttributeValues,
    goNext, goPrev,
    handleSaveProduct,
    completeness,
  } = studio;

  const [productTypes, setProductTypes] = useState<ProductTypeSummary[]>([]);
  const [governanceLoading, setGovernanceLoading] = useState<string | null>(null);

  // Load product types
  useEffect(() => {
    fetchProductTypes({ status: 'PUBLISHED' })
      .then(setProductTypes)
      .catch(() => setProductTypes([]));
  }, []);

  // Adjust step index for edit mode (offer step removed)
  const editStepIndex = EDIT_STEPS.findIndex((s: { key: Step }) => s.key === step);

  // Navigate within edit steps (skipping offer)
  const editGoNext = useCallback(() => {
    setError('');
    const currentIdx = EDIT_STEPS.findIndex((s: { key: Step }) => s.key === step);
    if (currentIdx < EDIT_STEPS.length - 1) {
      setStep((EDIT_STEPS[currentIdx + 1] as { key: Step }).key);
    }
  }, [step, setStep, setError]);

  const editGoPrev = useCallback(() => {
    setError('');
    const currentIdx = EDIT_STEPS.findIndex((s: { key: Step }) => s.key === step);
    if (currentIdx > 0) {
      setStep((EDIT_STEPS[currentIdx - 1] as { key: Step }).key);
    }
  }, [step, setStep, setError]);

  // ── Loading / Error states ──────────────────────────────────
  if (loadStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#5b6b74' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading product…</div>
          <div style={{ fontSize: 13 }}>Please wait while we load the product data.</div>
        </div>
      </div>
    );
  }

  if (loadStatus === 'forbidden') {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Access Denied</h1>
          <p style={{ fontSize: 14, color: '#5b6b74', marginBottom: 24 }}>
            You do not have permission to edit this product. Only the store that owns this product can edit it.
          </p>
          <button onClick={() => router.push('/merchant/catalog')}
            style={{ padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600 }}>
            Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  if (loadStatus === 'notfound') {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#16232b', marginBottom: 8 }}>Product Not Found</h1>
          <p style={{ fontSize: 14, color: '#5b6b74', marginBottom: 24 }}>
            The product you are looking for does not exist or has been deleted.
          </p>
          <button onClick={() => router.push('/merchant/catalog')}
            style={{ padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600 }}>
            Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  if (loadStatus === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Error Loading Product</h1>
          <p style={{ fontSize: 14, color: '#5b6b74', marginBottom: 24 }}>{loadError || 'An unexpected error occurred.'}</p>
          <button onClick={() => router.push('/merchant/catalog')}
            style={{ padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600 }}>
            Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  // P11: Governance status banner
  const productStatus = (state as any).status || 'DRAFT';
  const rejectionReason = (state as any).rejectionReason;
  const isReadOnly = productStatus === 'SUBMITTED' || productStatus === 'UNDER_REVIEW';

  const statusConfig: Record<string, { label: string; color: string; bg: string; icon: string; message: string }> = {
    DRAFT: { label: 'Draft', color: '#5b6b74', bg: '#f1f5f9', icon: '📝', message: 'This product is a draft. You can edit and submit it for review.' },
    SUBMITTED: { label: 'Submitted', color: '#92400e', bg: '#fef3c7', icon: '📤', message: 'This product has been submitted for review. Editing is disabled.' },
    UNDER_REVIEW: { label: 'Under Review', color: '#1e40af', bg: '#dbeafe', icon: '🔍', message: 'This product is currently under review. Editing is disabled.' },
    APPROVED: { label: 'Approved', color: '#166534', bg: '#dcfce7', icon: '✅', message: 'This product is approved. Editing high-risk fields will send it back for review.' },
    PUBLISHED: { label: 'Published', color: '#166534', bg: '#dcfce7', icon: '🌐', message: 'This product is live. Editing will unpublish it and send it for re-review.' },
    REJECTED: { label: 'Rejected', color: '#991b1b', bg: '#fef2f2', icon: '❌', message: 'This product was rejected. Fix the issues and resubmit.' },
  };
  const defaultStatus: { label: string; color: string; bg: string; icon: string; message: string } = { label: 'Draft', color: '#5b6b74', bg: '#f1f5f9', icon: '📝', message: 'This product is a draft. You can edit and submit it for review.' };
  const statusInfo: { label: string; color: string; bg: string; icon: string; message: string } = statusConfig[productStatus] !== undefined ? statusConfig[productStatus] : defaultStatus;

  return (
    <div style={{ minHeight: '100vh', background: '#f7f9fa' }}>
      <PageHeader
        title="Edit Product"
        subtitle={`Editing product — Step ${editStepIndex + 1} of ${EDIT_STEPS.length}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isDirty && (
              <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, background: '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>
                Unsaved changes
              </span>
            )}
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              Step {editStepIndex + 1} of {EDIT_STEPS.length}
            </span>
          </div>
        }
      />

      {/* P11: Governance Status Banner */}
      <div style={{
        padding: '12px 16px', background: statusInfo.bg, borderBottom: `2px solid ${statusInfo.color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{statusInfo.icon}</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: statusInfo.color }}>{statusInfo.label}</span>
            <span style={{ fontSize: 12, color: statusInfo.color, marginLeft: 8 }}>{statusInfo.message}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {productStatus === 'DRAFT' && (
            <button type="button" disabled={!!governanceLoading}
              onClick={async () => { setGovernanceLoading('submit'); setError(''); try { await submitProductForReview(productId); router.refresh(); } catch (e: any) { setError(e?.message || 'Submit failed'); } finally { setGovernanceLoading(null); } }}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600, fontSize: 12 }}>
              {governanceLoading === 'submit' ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
          {productStatus === 'SUBMITTED' && (
            <button type="button" disabled={!!governanceLoading}
              onClick={async () => { setGovernanceLoading('withdraw'); setError(''); try { await withdrawProductFromReview(productId); router.refresh(); } catch (e: any) { setError(e?.message || 'Withdraw failed'); } finally { setGovernanceLoading(null); } }}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d9e2e6', cursor: 'pointer', background: '#fff', color: '#5b6b74', fontWeight: 600, fontSize: 12 }}>
              {governanceLoading === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
            </button>
          )}
          {productStatus === 'REJECTED' && (
            <button type="button" disabled={!!governanceLoading}
              onClick={async () => { setGovernanceLoading('resubmit'); setError(''); try { await submitProductForReview(productId); router.refresh(); } catch (e: any) { setError(e?.message || 'Resubmit failed'); } finally { setGovernanceLoading(null); } }}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600, fontSize: 12 }}>
              {governanceLoading === 'resubmit' ? 'Resubmitting…' : 'Resubmit for Review'}
            </button>
          )}
          {productStatus === 'APPROVED' && (
            <button type="button" disabled={!!governanceLoading}
              onClick={async () => { setGovernanceLoading('publish'); setError(''); try { await publishProduct(productId); router.refresh(); } catch (e: any) { setError(e?.message || 'Publish failed'); } finally { setGovernanceLoading(null); } }}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 12 }}>
              {governanceLoading === 'publish' ? 'Publishing…' : 'Publish Now'}
            </button>
          )}
          {productStatus === 'PUBLISHED' && (
            <button type="button" disabled={!!governanceLoading}
              onClick={async () => { setGovernanceLoading('unpublish'); setError(''); try { await unpublishProduct(productId); router.refresh(); } catch (e: any) { setError(e?.message || 'Unpublish failed'); } finally { setGovernanceLoading(null); } }}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d9e2e6', cursor: 'pointer', background: '#fff', color: '#5b6b74', fontWeight: 600, fontSize: 12 }}>
              {governanceLoading === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
            </button>
          )}
        </div>
      </div>

      {/* P11: Rejection Reason */}
      {productStatus === 'REJECTED' && rejectionReason && (
        <div style={{
          padding: '12px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Rejection Reason</div>
          <div style={{ fontSize: 13, color: '#7f1d1d' }}>{rejectionReason}</div>
        </div>
      )}

      {/* P11: Read-only overlay for SUBMITTED/UNDER_REVIEW */}
      {isReadOnly && (
        <div style={{
          padding: '10px 16px', background: '#fffbeb', borderBottom: '1px solid #fde68a',
          fontSize: 12, color: '#92400e', textAlign: 'center', fontWeight: 600,
        }}>
          Editing is disabled while this product is {statusInfo.label.toLowerCase()}.
        </div>
      )}

      {/* Progress Indicator */}
      <ProgressIndicator currentStep={step} onStepClick={isReadOnly ? (/* istanbul ignore next */ (_s: Step) => {}) : setStep} stepIndex={editStepIndex} />

      {/* Step Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {/* 409 Conflict Banner */}
        {conflict && (
          <div style={{
            padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
                ⚠ Conflict Detected
              </div>
              <div style={{ fontSize: 13, color: '#7f1d1d' }}>
                This {conflict.resourceType} was modified by someone else. Your changes cannot be saved automatically.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={handleReload}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600, fontSize: 13 }}>
                Reload
              </button>
              <button type="button" onClick={handleDiscard}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d9e2e6', cursor: 'pointer', background: '#fff', color: '#5b6b74', fontWeight: 600, fontSize: 13 }}>
                Discard
              </button>
            </div>
          </div>
        )}

        {error && !conflict && (
          <div style={{ padding: 12, background: '#fbeeec', color: '#991b1b', borderRadius: 6, marginBottom: 16 }}>{error}</div>
        )}
        {success && (
          <div style={{ padding: 12, background: '#eaf5ef', color: '#1b7a4b', borderRadius: 6, marginBottom: 16 }}>{success}</div>
        )}

        {/* Step 1: Identity (edit mode — store/productType disabled) */}
        {step === 'identity' && (
          <StepIdentity
            state={state}
            setState={setState as React.Dispatch<React.SetStateAction<StudioState>>}
            stores={stores}
            categories={categories}
            brands={brands}
            productTypes={productTypes}
            canonicalMatches={[]}
            onSearchCanonical={async () => []}
            editMode
          />
        )}

        {/* Step 2: Specifications */}
        {step === 'specifications' && (
          <StepSpecifications
            state={state}
            setState={setState as React.Dispatch<React.SetStateAction<StudioState>>}
          />
        )}

        {/* Step 3: Variants (edit mode — show existing variants) */}
        {step === 'variants' && (
          <StepVariants
            state={state}
            setState={setState as React.Dispatch<React.SetStateAction<StudioState>>}
            existingVariants={existingVariants}
            editMode
            productId={productId}
            variantAttributeValues={variantAttributeValues}
          />
        )}

        {/* Step 4: Media */}
        {step === 'media' && (
          <StepMedia
            state={state}
            setState={setState as React.Dispatch<React.SetStateAction<StudioState>>}
            editMode
            productId={productId}
            existingMedia={existingMedia}
          />
        )}

        {/* Step 5: Review */}
        {step === 'review' && (
          <StepReview
            state={state}
            stores={stores}
            categories={categories}
            brands={brands}
            completenessScore={completeness()}
            editMode
          />
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, gap: 12 }}>
          <button type="button" onClick={editGoPrev} disabled={editStepIndex === 0 || isReadOnly}
            style={{
              padding: '10px 20px', borderRadius: 6, border: '1px solid #d9e2e6',
              cursor: (editStepIndex === 0 || isReadOnly) ? 'not-allowed' : 'pointer',
              opacity: (editStepIndex === 0 || isReadOnly) ? 0.5 : 1, background: '#fff',
            }}>
            Previous
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isReadOnly && step === 'review' ? (
              <button type="button" onClick={async () => {
                const pid = await handleSaveProduct();
                if (pid) {
                  setSuccess?.('Product updated successfully!');
                }
              }} disabled={saving}
                style={{ padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#22c55e', color: '#fff', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Update Product'}
              </button>
            ) : !isReadOnly ? (
              <button type="button" onClick={editGoNext}
                style={{ padding: '10px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600 }}>
                Next
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
