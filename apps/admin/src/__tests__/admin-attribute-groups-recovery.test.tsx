import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { fetchAttributeGroups, fetchAttributes, createAttributeGroup } = vi.hoisted(() => ({
  fetchAttributeGroups: vi.fn(),
  fetchAttributes: vi.fn(),
  createAttributeGroup: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchAttributeGroups: (...args: unknown[]) => fetchAttributeGroups(...args),
  fetchAttributes: (...args: unknown[]) => fetchAttributes(...args),
  createAttributeGroup: (...args: unknown[]) => createAttributeGroup(...args),
}));
vi.mock('../hooks/useRequirePerms', () => ({
  useRequirePerms: () => ({ hasAccess: true, missingPerms: [] }),
  AccessDenied: () => <div>Access denied</div>,
}));
vi.mock('@scs/ui-kit', () => ({ SkeletonTable: () => <div role="status">Loading table</div> }));
vi.mock('../components/management.module.css', () => ({ default: {} }));
vi.mock('../components/DetailDialog', () => ({ default: () => null }));

import AttributeGroupsPage from '../app/attribute-groups/page';

describe('admin attribute group read recovery', () => {
  beforeEach(() => {
    fetchAttributeGroups.mockReset();
    fetchAttributes.mockReset();
    createAttributeGroup.mockReset();
    fetchAttributeGroups.mockResolvedValue([]);
    fetchAttributes.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('does not show an empty group state after a failed directory read and retries', async () => {
    fetchAttributeGroups
      .mockRejectedValueOnce(new Error('Attribute groups unavailable'))
      .mockResolvedValueOnce([]);

    render(<AttributeGroupsPage />);

    expect((await screen.findByRole('alert')).textContent).toContain('Attribute groups unavailable');
    expect(screen.queryByText('No attribute groups found.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No attribute groups found.')).toBeTruthy();
  });
});
