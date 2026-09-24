'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchVariantMatrix, VariantMatrix, VariantMatrixDimension, VariantMatrixCombination,
} from '../lib/buyer-api';

interface UseVariantSelectionResult {
  matrix: VariantMatrix | null;
  loading: boolean;
  error: string | null;
  /** Currently selected value for each dimension (attrId → option value). */
  selectedValues: Record<string, string>;
  /** Set the selected value for a dimension. */
  selectValue: (attrId: string, value: string) => void;
  /** The resolved variant matching the current selection, or null if no match. */
  resolvedVariant: VariantMatrixCombination | null;
  /** Whether the current selection is unavailable (no matching active variant). */
  isUnavailable: boolean;
  /** Available options for a dimension given the current selections of OTHER dimensions. */
  availableOptions: (attrId: string) => string[];
  /** Whether a specific option is available given current selections. */
  isOptionAvailable: (attrId: string, value: string) => boolean;
}

/**
 * PHASE 7: Manages the dynamic variant selection flow.
 *
 * 1. Fetches the variant matrix (dimensions + combinations) for a product.
 * 2. Tracks the buyer's selection per dimension.
 * 3. Resolves the matching variant for the current selection.
 * 4. Computes which options are available given other selections (pruning
 *    combinations that have no matching variant).
 */
export function useVariantSelection(productId: string | null): UseVariantSelectionResult {
  const [matrix, setMatrix] = useState<VariantMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});

  // Fetch matrix when product changes
  useEffect(() => {
    if (!productId) {
      setMatrix(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchVariantMatrix(productId)
      .then(m => {
        setMatrix(m);
        // Initialize selection to first option of each dimension
        const initial: Record<string, string> = {};
        for (const dim of m.dimensions) {
          if (dim.options.length > 0) {
            initial[dim.attributeDefinitionId] = dim.options[0]!;
          }
        }
        setSelectedValues(initial);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load variants'))
      .finally(() => setLoading(false));
  }, [productId]);

  const selectValue = useCallback((attrId: string, value: string) => {
    setSelectedValues(prev => ({ ...prev, [attrId]: value }));
  }, []);

  // Check if a specific option for a dimension leads to at least one valid combination
  const isOptionAvailable = useCallback((attrId: string, value: string): boolean => {
    if (!matrix || matrix.combinations.length === 0) return true;
    // Build a test selection: current selections + this option for the target dimension
    const testSelection = { ...selectedValues, [attrId]: value };
    // Check if any active combination matches all selected values
    return matrix.combinations.some(combo => {
      if (!combo.isActive) return false;
      for (const [dimId, val] of Object.entries(testSelection)) {
        if (!val) continue; // skip unselected dimensions
        if (combo.values[dimId] !== val) return false;
      }
      return true;
    });
  }, [matrix, selectedValues]);

  // Get available options for a dimension (only those that lead to valid combinations)
  const availableOptions = useCallback((attrId: string): string[] => {
    if (!matrix) return [];
    const dim = matrix.dimensions.find(d => d.attributeDefinitionId === attrId);
    if (!dim) return [];
    return dim.options.filter(opt => isOptionAvailable(attrId, opt));
  }, [matrix, isOptionAvailable]);

  // Resolve the matching variant for the current full selection
  const resolvedVariant = useMemo((): VariantMatrixCombination | null => {
    if (!matrix || matrix.combinations.length === 0) return null;
    const allSelected = matrix.dimensions.every(d => selectedValues[d.attributeDefinitionId]);
    if (!allSelected) return null;
    const match = matrix.combinations.find(combo => {
      return matrix.dimensions.every(d => {
        const attrId = d.attributeDefinitionId;
        return combo.values[attrId] === selectedValues[attrId];
      });
    });
    return match ?? null;
  }, [matrix, selectedValues]);

  const isUnavailable = resolvedVariant === null && !loading && matrix !== null && matrix.dimensions.length > 0;

  return {
    matrix, loading, error,
    selectedValues, selectValue,
    resolvedVariant, isUnavailable,
    availableOptions, isOptionAvailable,
  };
}
