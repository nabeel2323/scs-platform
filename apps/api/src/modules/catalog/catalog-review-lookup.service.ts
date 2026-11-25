import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { productVariants } from './catalog.schema';

/**
 * Catalog-owned product review scope check.
 * Reviews supplies purchased variant IDs; Catalog decides which product
 * those persisted variant rows belong to.
 */
@Injectable()
export class CatalogReviewLookupService {
  constructor(private readonly db: DatabaseService) {}

  private requireUserActorContext(): void {
    if (this.db.currentActorContext?.actorKind !== 'user') {
      throw new ForbiddenException('Authenticated user database actor context is required');
    }
  }

  async hasVariantForProduct(variantIds: readonly string[], productId: string): Promise<boolean> {
    const uniqueIds = [...new Set(variantIds.filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) return false;
    this.requireUserActorContext();

    const match = await this.db.db.query.productVariants.findFirst({
      where: and(inArray(productVariants.id, uniqueIds), eq(productVariants.productId, productId)),
      columns: { id: true },
    });
    return Boolean(match);
  }
}
