/**
 * Production Catalog Seed — Products index.
 *
 * Aggregates all product data modules into a single export.
 */

import { LAPTOP_PRODUCTS } from './laptops';
import { OTHER_PRODUCTS } from './other';
import type { SeedProduct } from '../types';

export const ALL_PRODUCTS: SeedProduct[] = [
  ...LAPTOP_PRODUCTS,
  ...OTHER_PRODUCTS,
];
