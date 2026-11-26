import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';

const actor = { sub: 'merchant-user', role: 'MERCHANT_OWNER', activeOrg: 'org-1' };
const mediaRow = {
  id: 'media-1',
  productId: 'product-1',
  url: 'products/product-1/image.jpg',
  thumbUrl: null,
  sortOrder: 0,
};
const product = {
  id: 'product-1',
  storeId: null,
  images: [],
  status: 'ACTIVE',
};

describe('CatalogService product/media read actor boundaries (G-002)', () => {
  it('loads media rows under the user actor and resolves storage URLs after the DB scope closes', async () => {
    let activeActor: Record<string, unknown> | null = null;
    const withActorContext = vi.fn(async (context: Record<string, unknown>, operation: () => Promise<unknown>) => {
      activeActor = context;
      try {
        return await operation();
      } finally {
        activeActor = null;
      }
    });
    const findProduct = vi.fn(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return { ...product };
    });
    const findMany = vi.fn(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return [mediaRow];
    });
    const db = {
      get currentActorContext() {
        return activeActor;
      },
      withActorContext,
      db: { query: { products: { findFirst: findProduct }, productMedia: { findMany } } },
    };
    const service = new CatalogService(
      db as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const resolveMediaRow = vi.spyOn(service as any, 'resolveMediaRow').mockImplementation(async (row) => {
      expect(activeActor).toBeNull();
      return { ...(row as Record<string, unknown>), displayUrl: 'https://cdn.example.test/image.jpg', thumbSrc: null };
    });

    const result = await service.listMediaByProduct('product-1', actor);

    expect(withActorContext).toHaveBeenCalledOnce();
    expect(findProduct).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledOnce();
    expect(resolveMediaRow).toHaveBeenCalledOnce();
    expect(result[0]).toMatchObject({ id: 'media-1', displayUrl: 'https://cdn.example.test/image.jpg' });
  });

  it('authorizes the product inside a short actor scope before returning a Redis cache hit', async () => {
    let activeActor: Record<string, unknown> | null = null;
    const withActorContext = vi.fn(async (context: Record<string, unknown>, operation: () => Promise<unknown>) => {
      activeActor = context;
      try {
        return await operation();
      } finally {
        activeActor = null;
      }
    });
    const findProduct = vi.fn(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return { ...product };
    });
    const cached = { id: 'product-1', title: 'Cached product' };
    const redisGet = vi.fn(async () => {
      expect(activeActor).toBeNull();
      return JSON.stringify(cached);
    });
    const redisSet = vi.fn();
    const service = new CatalogService(
      {
        withActorContext,
        db: { query: { products: { findFirst: findProduct } } },
      } as any,
      { client: { get: redisGet, set: redisSet } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getProductDetail('product-1', actor, false)).resolves.toEqual(cached);

    expect(withActorContext).toHaveBeenCalledOnce();
    expect(findProduct).toHaveBeenCalledOnce();
    expect(redisGet).toHaveBeenCalledOnce();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('does not serve cached draft product data to a non-member', async () => {
    let activeActor: Record<string, unknown> | null = null;
    const withActorContext = vi.fn(async (context: Record<string, unknown>, operation: () => Promise<unknown>) => {
      activeActor = context;
      try {
        return await operation();
      } finally {
        activeActor = null;
      }
    });
    const redisGet = vi.fn();
    const service = new CatalogService(
      {
        withActorContext,
        db: {
          query: {
            products: { findFirst: vi.fn().mockResolvedValue({ id: 'product-1', storeId: 'store-a', status: 'DRAFT' }) },
            stores: { findFirst: vi.fn().mockResolvedValue({ orgId: 'org-1' }) },
            organizationMembers: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
            organizations: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
            storeMembers: { findFirst: vi.fn().mockResolvedValue(null) },
          },
        },
      } as any,
      { client: { get: redisGet, set: vi.fn() } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getProductDetail('product-1', actor, true)).rejects.toThrow(
      'You are not authorized for this store',
    );
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('keeps product detail DB reads in one actor scope and Redis/storage I/O outside it', async () => {
    let activeActor: Record<string, unknown> | null = null;
    const withActorContext = vi.fn(async (context: Record<string, unknown>, operation: () => Promise<unknown>) => {
      activeActor = context;
      try {
        return await operation();
      } finally {
        activeActor = null;
      }
    });
    const findProduct = vi.fn(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return { ...product };
    });
    const findMedia = vi.fn(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return [mediaRow];
    });
    const findVariants = vi.fn(async () => {
      expect(activeActor).toMatchObject({ actorKind: 'user', actorId: actor.sub });
      return [];
    });
    const select = vi.fn(() => {
      const query: any = {
        from: vi.fn(() => query),
        leftJoin: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn(async () => []),
      };
      return query;
    });
    const redisGet = vi.fn(async () => {
      expect(activeActor).toBeNull();
      return null;
    });
    const redisSet = vi.fn(async () => {
      expect(activeActor).toBeNull();
    });
    const db = {
      get currentActorContext() {
        return activeActor;
      },
      withActorContext,
      db: {
        query: {
          products: { findFirst: findProduct },
          productMedia: { findMany: findMedia },
          productVariants: { findMany: findVariants },
          warehouses: { findMany: vi.fn().mockResolvedValue([]) },
          inventoryItems: { findMany: vi.fn().mockResolvedValue([]) },
        },
        select,
      },
    };
    const service = new CatalogService(
      db as any,
      { client: { get: redisGet, set: redisSet } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const resolveMediaRow = vi.spyOn(service as any, 'resolveMediaRow').mockImplementation(async (row) => {
      expect(activeActor).toBeNull();
      return { ...(row as Record<string, unknown>), displayUrl: 'https://cdn.example.test/image.jpg', thumbSrc: null };
    });

    const result = await service.getProductDetail('product-1', actor, false);

    expect(withActorContext).toHaveBeenCalledTimes(2);
    expect(findProduct).toHaveBeenCalledTimes(3);
    expect(findMedia).toHaveBeenCalledOnce();
    expect(findVariants).toHaveBeenCalledOnce();
    expect(redisGet).toHaveBeenCalledOnce();
    expect(redisSet).toHaveBeenCalledOnce();
    expect(resolveMediaRow).toHaveBeenCalledOnce();
    expect(result.media[0]).toMatchObject({ id: 'media-1', displayUrl: 'https://cdn.example.test/image.jpg' });
  });
});
