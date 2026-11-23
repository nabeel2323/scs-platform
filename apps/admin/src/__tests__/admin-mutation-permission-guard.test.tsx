import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminRequest: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  adminRequest: mocks.adminRequest,
}));

import { useAdminMutation } from '../components/EntityActions';

function MutationHarness({ allowed }: { allowed: boolean }) {
  const action = useAdminMutation(vi.fn(), () => allowed);
  return <button type="button" onClick={() => void action.run('admin/users/user-1', 'PATCH', { status: 'SUSPENDED' })}>Run action</button>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('shared Admin mutation permission guard', () => {
  it('does not submit when permission is lost before the handler runs', async () => {
    mocks.adminRequest.mockResolvedValue({});
    const { rerender } = render(<MutationHarness allowed />);
    rerender(<MutationHarness allowed={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run action' }));

    await waitFor(() => expect(mocks.adminRequest).not.toHaveBeenCalled());
  });

  it('submits when the action-specific permission is present', async () => {
    mocks.adminRequest.mockResolvedValue({});
    render(<MutationHarness allowed />);

    fireEvent.click(screen.getByRole('button', { name: 'Run action' }));

    await waitFor(() => expect(mocks.adminRequest).toHaveBeenCalledWith(
      'admin/users/user-1',
      expect.objectContaining({ method: 'PATCH' }),
    ));
  });
});
