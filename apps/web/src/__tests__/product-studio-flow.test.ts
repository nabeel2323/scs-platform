import { describe, expect, it, vi } from 'vitest';
import { continueProductStudioStep } from '../lib/product-studio-flow';

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
