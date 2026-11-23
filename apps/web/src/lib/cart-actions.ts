export async function runCartMutation(
  actionKey: string,
  action: () => Promise<unknown>,
  refresh: () => Promise<unknown>,
  setPendingAction: (value: string | null) => void,
  setError: (message: string) => void,
): Promise<boolean> {
  setPendingAction(actionKey);
  setError('');
  try {
    await action();
    await refresh();
    return true;
  } catch (error) {
    setError(
      error instanceof Error ? error.message : 'Unable to update your cart. Please try again.',
    );
    return false;
  } finally {
    setPendingAction(null);
  }
}
