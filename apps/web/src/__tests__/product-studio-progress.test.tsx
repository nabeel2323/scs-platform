import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProgressIndicator from '../app/merchant/product-studio/components/ProgressIndicator';

describe('Product Studio progress navigation', () => {
  it('allows only the next sequential step and completed steps', () => {
    const onStepClick = vi.fn();
    render(
      <ProgressIndicator
        currentStep="offer"
        stepIndex={3}
        onStepClick={onStepClick}
      />,
    );

    const media = screen.getByRole('button', { name: /Media/ });
    const review = screen.getByRole('button', { name: /Review/ });
    const identity = screen.getByRole('button', { name: /Identity/ });

    expect((media as HTMLButtonElement).disabled).toBe(false);
    expect((review as HTMLButtonElement).disabled).toBe(true);
    expect((identity as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(media);
    expect(onStepClick).toHaveBeenCalledWith('media');
    fireEvent.click(review);
    expect(onStepClick).toHaveBeenCalledTimes(1);
  });

  it('disables every step while the product is being saved', () => {
    render(
      <ProgressIndicator
        currentStep="offer"
        stepIndex={3}
        onStepClick={vi.fn()}
        disabled
      />,
    );

    expect(screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
