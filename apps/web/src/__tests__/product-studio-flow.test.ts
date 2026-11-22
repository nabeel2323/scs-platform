import { describe, expect, it, vi } from 'vitest';
import { buildOfferTargetKey, continueProductStudioStep, persistProductStudioMedia, resolveProductPersistenceTarget } from '../lib/product-studio-flow';


describe('buildOfferTargetKey', () => {
  it('scopes the offer retry marker by store, product and variant', () => {
    expect(buildOfferTargetKey({ storeId: 'store-a', productId: 'product-a', variantId: 'variant-a' }))
      .not.toBe(buildOfferTargetKey({ storeId: 'store-a', productId: 'product-a', variantId: 'variant-b' }));
    expect(buildOfferTargetKey({ storeId: 'store-a', productId: 'product-a', variantId: null }))
      .not.toBe(buildOfferTargetKey({ storeId: 'store-b', productId: 'product-a', variantId: null }));
  });
});

describe('resolveProductPersistenceTarget', () => {
  it('prefers the selected canonical product over a stale wizard product ID', () => {
    expect(
      resolveProductPersistenceTarget({
        productId: 'stale-wizard-product',
        useExistingProductId: 'canonical-product-1',
      }),
    ).toEqual({
      productId: 'canonical-product-1',
      isExistingCanonical: true,
    });
  });

  it('updates a product created earlier in this wizard', () => {
    expect(
      resolveProductPersistenceTarget({
        productId: 'merchant-product-1',
        useExistingProductId: null,
      }),
    ).toEqual({
      productId: 'merchant-product-1',
      isExistingCanonical: false,
    });
  });

  it('creates a product only when neither an existing nor wizard product ID exists', () => {
    expect(
      resolveProductPersistenceTarget({
        productId: null,
        useExistingProductId: null,
      }),
    ).toEqual({
      productId: null,
      isExistingCanonical: false,
    });
  });
});


describe('persistProductStudioMedia', () => {
  it('adds only media URLs not already persisted for the product', async () => {
    const fetchExisting = vi.fn().mockResolvedValue([{ url: 'https://cdn.example.com/one.jpg' }]);
    const add = vi.fn().mockResolvedValue({ id: 'media-two' });

    await persistProductStudioMedia(
      'product-a',
      [
        { url: 'https://cdn.example.com/one.jpg', altText: 'Existing' },
        { url: 'https://cdn.example.com/two.jpg', altText: 'New image' },
      ],
      fetchExisting,
      add,
    );

    expect(add).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith('product-a', {
      url: 'https://cdn.example.com/two.jpg',
      mediaType: 'IMAGE',
      altText: 'New image',
      sortOrder: 1,
    });
  });

  it('does not create media records for an empty media selection', async () => {
    const fetchExisting = vi.fn();
    const add = vi.fn();

    await persistProductStudioMedia('product-a', [], fetchExisting, add);

    expect(fetchExisting).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});

describe('continueProductStudioStep', () => {
  it('does not advance when product persistence fails on the offer step', async () => {
    const saveProduct = vi.fn().mockResolvedValue(null);
    const goNext = vi.fn();
    const setError = vi.fn();

    await expect(
      continueProductStudioStep({
        step: 'offer',
        saving: false,
        productId: null,
        title: 'Laptop',
        storeId: 'store-a',
        saveProduct,
        setError,
        goNext,
      }),
    ).resolves.toBe(false);

    expect(saveProduct).toHaveBeenCalledWith({ includeOffer: false });
    expect(goNext).not.toHaveBeenCalled();
  });

  it('blocks incomplete product identity before attempting persistence', async () => {
    const saveProduct = vi.fn();
    const goNext = vi.fn();
    const setError = vi.fn();

    await expect(
      continueProductStudioStep({
        step: 'offer',
        saving: false,
        productId: null,
        title: '  ',
        storeId: 'store-a',
        saveProduct,
        setError,
        goNext,
      }),
    ).resolves.toBe(false);

    expect(setError).toHaveBeenCalledWith(
      'Choose a store and enter a product title before continuing.',
    );
    expect(saveProduct).not.toHaveBeenCalled();
    expect(goNext).not.toHaveBeenCalled();
  });

  it('advances only after the product is persisted', async () => {
    const saveProduct = vi.fn().mockResolvedValue('product-a');
    const goNext = vi.fn();

    await expect(
      continueProductStudioStep({
        step: 'offer',
        saving: false,
        productId: null,
        title: 'Laptop',
        storeId: 'store-a',
        saveProduct,
        setError: vi.fn(),
        goNext,
      }),
    ).resolves.toBe(true);

    expect(goNext).toHaveBeenCalledOnce();
  });

  it('does not start another save or advance while a save is in progress', async () => {
    const saveProduct = vi.fn();
    const goNext = vi.fn();

    await expect(
      continueProductStudioStep({
        step: 'offer',
        saving: true,
        productId: null,
        title: 'Laptop',
        storeId: 'store-a',
        saveProduct,
        setError: vi.fn(),
        goNext,
      }),
    ).resolves.toBe(false);

    expect(saveProduct).not.toHaveBeenCalled();
    expect(goNext).not.toHaveBeenCalled();
  });


  it('does not advance when an existing product update fails', async () => {
    const saveProduct = vi.fn().mockResolvedValue(null);
    const setError = vi.fn();
    const goNext = vi.fn();

    await expect(
      continueProductStudioStep({
        step: 'offer',
        saving: false,
        productId: 'product-a',
        title: 'Updated laptop',
        storeId: 'store-a',
        saveProduct,
        setError,
        goNext,
      }),
    ).resolves.toBe(false);

    expect(saveProduct).toHaveBeenCalledWith({ includeOffer: false });
    expect(goNext).not.toHaveBeenCalled();
  });

  it('does not create the product again after its ID has been persisted', async () => {
    const saveProduct = vi.fn();
    const goNext = vi.fn();

    await expect(
      continueProductStudioStep({
        step: 'offer',
        saving: false,
        productId: 'product-a',
        title: 'Laptop',
        storeId: 'store-a',
        saveProduct,
        setError: vi.fn(),
        goNext,
      }),
    ).resolves.toBe(true);

    expect(saveProduct).not.toHaveBeenCalled();
    expect(goNext).toHaveBeenCalledOnce();
  });
});
