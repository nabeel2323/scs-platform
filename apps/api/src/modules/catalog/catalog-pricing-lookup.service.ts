import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { products, productVariants } from './catalog.schema';

export interface VariantPricingDetails {
  variantId: string;
  variantSku: string;
  variantTitle: string | null;
  productTitle: string;
  storeId: string | null;
}

/**
 * Public catalog lookup contract for pricing consumers.
 *
 * Catalog owns product and variant persistence. Pricing consumes this narrow
 * read model instead of importing Catalog's Drizzle tables directly.
 */
@Injectable()
export class CatalogPricingLookupService {
  constructor(private readonly db: DatabaseService) {}

  async getVariantPricingDetails(variantIds: readonly string[]): Promise<VariantPricingDetails[]> {
    const uniqueIds = [...new Set(variantIds.filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) return [];

    const variants = await this.db.db.query.productVariants.findMany({
      where: inArray(productVariants.id, uniqueIds),
      columns: {
        id: true,
        productId: true,
        sku: true,
        title: true,
      },
    });
    if (variants.length === 0) return [];

    const productIds = [...new Set(variants.map((variant) => variant.productId))];
    const productRows = await this.db.db.query.products.findMany({
      where: inArray(products.id, productIds),
      columns: {
        id: true,
        storeId: true,
        title: true,
      },
    });
    const productById = new Map(productRows.map((product) => [product.id, product]));

    return variants
      .flatMap((variant) => {
        const product = productById.get(variant.productId);
        if (!product) return [];

        return [
          {
            variantId: variant.id,
            variantSku: variant.sku,
            variantTitle: variant.title,
            productTitle: product.title,
            storeId: product.storeId,
          },
        ];
      })
      .sort(
        (left, right) =>
          left.productTitle.localeCompare(right.productTitle) ||
          left.variantSku.localeCompare(right.variantSku),
      );
  }

  async variantBelongsToStore(variantId: string, storeId: string): Promise<boolean> {
    const [variant] = await this.getVariantPricingDetails([variantId]);
    return variant?.storeId === storeId;
  }
}
