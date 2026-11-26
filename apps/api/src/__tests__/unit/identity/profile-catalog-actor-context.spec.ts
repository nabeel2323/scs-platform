import 'reflect-metadata';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ProfileController } from '../../../modules/identity/profile.controller';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';

const user = {
  sub: 'user-1',
  role: 'BUYER',
  activeOrg: 'org-1',
} as any;

describe('ProfileController Catalog caller actor context (G-002)', () => {
  it('forwards the authenticated actor to favorites and saved-supplier operations', async () => {
    const catalogService = {
      listFavorites: vi.fn().mockResolvedValue([]),
      addFavorite: vi.fn().mockResolvedValue({ id: 'favorite-1' }),
      removeFavorite: vi.fn().mockResolvedValue({ success: true }),
      listSavedSuppliers: vi.fn().mockResolvedValue([]),
      saveSupplier: vi.fn().mockResolvedValue({ id: 'supplier-1' }),
      removeSavedSupplier: vi.fn().mockResolvedValue({ success: true }),
    };
    const controller = new ProfileController({} as any, {} as any, catalogService as any);
    const actor = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };

    await controller.getFavorites(user);
    await controller.addFavorite(user, { productId: 'product-1' });
    await controller.removeFavorite(user, 'product-1');
    await controller.getSavedSuppliers(user);
    await controller.saveSupplier(user, { storeId: 'store-1' });
    await controller.removeSavedSupplier(user, 'store-1');

    expect(catalogService.listFavorites).toHaveBeenCalledWith(user.sub, actor);
    expect(catalogService.addFavorite).toHaveBeenCalledWith(user.sub, 'product-1', actor);
    expect(catalogService.removeFavorite).toHaveBeenCalledWith(user.sub, 'product-1', actor);
    expect(catalogService.listSavedSuppliers).toHaveBeenCalledWith(user.sub, actor);
    expect(catalogService.saveSupplier).toHaveBeenCalledWith(user.sub, 'store-1', actor);
    expect(catalogService.removeSavedSupplier).toHaveBeenCalledWith(user.sub, 'store-1', actor);
  });

  it.each([
    'getFavorites',
    'addFavorite',
    'removeFavorite',
    'getSavedSuppliers',
    'saveSupplier',
    'removeSavedSupplier',
  ])('%s keeps its DB operations inside the verified request actor scope', (methodName) => {
    const descriptor = Object.getOwnPropertyDescriptor(ProfileController.prototype, methodName);
    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor!.value)).toContain(
      TenantDatabaseContextInterceptor,
    );
  });
});
