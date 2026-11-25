import { fetchInventoryMovements, StockMovement } from './buyer-api';

export interface InventoryHistoryReadResult {
  movements: StockMovement[];
  error: string;
}

/** Keep a failed history read distinct from a successful empty history. */
export async function readInventoryHistory(itemId: string): Promise<InventoryHistoryReadResult> {
  try {
    return { movements: await fetchInventoryMovements(itemId), error: '' };
  } catch (err) {
    return {
      movements: [],
      error: err instanceof Error ? err.message : 'Failed to load stock movement history',
    };
  }
}
