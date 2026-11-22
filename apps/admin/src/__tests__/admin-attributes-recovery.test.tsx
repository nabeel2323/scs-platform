import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchAttributes, createAttribute, updateAttribute, deleteAttribute, addAttributeOption } = vi.hoisted(() => ({
  fetchAttributes: vi.fn(),
  createAttribute: vi.fn(),
  updateAttribute: vi.fn(),
  deleteAttribute: vi.fn(),
  addAttributeOption: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('../lib/api', () => ({
  fetchAttributes: (...args: unknown[]) => fetchAttributes(...args),
  createAttribute: (...args: unknown[]) => createAttribute(...args),
  updateAttribute: (...args: unknown[]) => updateAttribute(...args),
  deleteAttribute: (...args: unknown[]) => deleteAttribute(...args),
  addAttributeOption: (...args: unknown[]) => addAttributeOption(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({ SkeletonTable: () => <div role="status">Loading table</div> }));
vi.mock('../components/management.module.css', () => ({ default: {} }));
vi.mock('../components/DetailDialog', () => ({ default: () => null }));

import AttributesPage from '../app/attributes/page';

describe('admin attribute definition read recovery', () => {
  beforeEach(() => {
    fetchAttributes.mockReset();
    createAttribute.mockReset();
    updateAttribute.mockReset();
    deleteAttribute.mockReset();
    addAttributeOption.mockReset();
    fetchAttributes.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not show an empty attribute state after a failed read and retries', async () => {
    fetchAttributes
      .mockRejectedValueOnce(new Error('Attribute directory unavailable'))
      .mockResolvedValueOnce([]);

    render(<AttributesPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Attribute directory unavailable');
    expect(screen.queryByText('No attributes found.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No attributes found.')).toBeTruthy();
  });
});
