'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useProductStudio, STEPS } from '../../../hooks/useProductStudio';
import { ProductTypeSummary, fetchProductTypes } from '../../../lib/buyer-api';
import { PageHeader } from '@scs/ui-kit';
import ProgressIndicator from './components/ProgressIndicator';
import StepIdentity from './steps/StepIdentity';
import StepSpecifications from './steps/StepSpecifications';
import StepVariants from './steps/StepVariants';
import StepOffer from './steps/StepOffer';
import StepMedia from './steps/StepMedia';
import StepReview from './steps/StepReview';

export default function ProductStudioPage() {
  const router = useRouter();
  const studio = useProductStudio();
  const { step, setStep, stepIndex, state, setState, stores, categories, brands, error, saving, success, goNext, goPrev, handleSaveProduct, completeness, canonicalMatches, canonicalSearchResults, searchCanonical, searchCanonicalFreeText, existingVariants, loadExistingVariants } = studio;
  const [productTypes, setProductTypes] = useState<ProductTypeSummary[]>([]);

  // Load product types
  useEffect(() => {
    fetchProductTypes({ status: 'PUBLISHED' })
      .then(setProductTypes)
      .catch(() => setProductTypes([]));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f7f9fa' }}>
      <PageHeader
        title="Product Studio"
        subtitle="Create a product with specifications, variants, and offers"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          </div>
        }
      />

      {/* Progress Indicator */}
      <ProgressIndicator currentStep={step} onStepClick={setStep} stepIndex={stepIndex} />

      {/* Step Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {error && <div style={{ padding: 12, background: '#fbeeec', color: '#991b1b', borderRadius: 6, marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ padding: 12, background: '#eaf5ef', color: '#1b7a4b', borderRadius: 6, marginBottom: 16 }}>{success}</div>}

        {/* Step 1: Identity */}
        {step === 'identity' && (
          <StepIdentity
            state={state}
            setState={setState}
            stores={stores}
            categories={categories}
            brands={brands}
            productTypes={productTypes}
            canonicalMatches={canonicalMatches}
            onSearchCanonical={searchCanonical}
            canonicalSearchResults={canonicalSearchResults}
            onSearchCanonicalFreeText={searchCanonicalFreeText}
          />
        )}

        {/* Step 2: Specifications */}
        {step === 'specifications' && (
          <StepSpecifications state={state} setState={setState} />
        )}

        {/* Step 3: Variants */}
        {step === 'variants' && (
          <StepVariants
            state={state}
            setState={setState}
            existingVariants={existingVariants}
            onLoadExistingVariants={loadExistingVariants}
          />
        )}

        {/* Step 4: Offer */}
        {step === 'offer' && (
          <StepOffer
            state={state}
            setState={setState}
            existingVariants={existingVariants}
            stores={stores}
          />
        )}

        {/* Step 5: Media */}
        {step === 'media' && (
          <StepMedia state={state} setState={setState} />
        )}

        {/* Step 6: Review */}
        {step === 'review' && (
          <StepReview
            state={state}
            stores={stores}
            categories={categories}
            brands={brands}
            completenessScore={completeness()}
          />
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, gap: 12 }}>
          <button type="button" onClick={goPrev} disabled={stepIndex === 0}
            style={{
              padding: '10px 20px', borderRadius: 6, border: '1px solid #d9e2e6',
              cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: stepIndex === 0 ? 0.5 : 1, background: '#fff',
            }}>
            Previous
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 'review' ? (
              <button type="button" onClick={async () => {
                const pid = await handleSaveProduct();
                if (pid) router.push('/merchant/catalog');
              }} disabled={saving}
                style={{ padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#22c55e', color: '#fff', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save Product'}
              </button>
            ) : (
              <button type="button" onClick={async () => {
                // Auto-save on step 4 (offer) to create the product before configuring offer
                if (step === 'offer' && !state.productId && state.title && state.storeId) {
                  await handleSaveProduct();
                }
                goNext();
              }}
                style={{ padding: '10px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f3340', color: '#fff', fontWeight: 600 }}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
