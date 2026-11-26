import 'reflect-metadata';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminController } from '../../../modules/admin/admin.controller';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';

const admin = {
  sub: 'admin-1',
  role: 'ADMIN',
  activeOrg: null,
  perms: ['catalog:products:write', 'admin:merchants:read'],
} as any;

describe('AdminController Catalog mixed-operation actor boundaries (G-002)', () => {
  it('keeps admin product update outside a request-wide transaction and forwards the caller', async () => {
    const adminService = { adminUpdateProduct: vi.fn().mockResolvedValue({ id: 'product-1' }) };
    const controller = new AdminController(adminService as any);
    const descriptor = Object.getOwnPropertyDescriptor(
      AdminController.prototype,
      'adminUpdateProduct',
    );

    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor!.value) ?? [],
    ).not.toContain(TenantDatabaseContextInterceptor);

    await controller.adminUpdateProduct(
      'product-1',
      { title: 'Updated', updatedAt: '2026-11-25T10:00:00.000Z' } as any,
      admin,
    );

    expect(adminService.adminUpdateProduct).toHaveBeenCalledWith(
      'product-1',
      { title: 'Updated' },
      '2026-11-25T10:00:00.000Z',
      { sub: admin.sub, role: admin.role, activeOrg: admin.activeOrg },
    );
  });

  it('keeps media preview storage signing outside a request-wide transaction and forwards the caller', async () => {
    const adminService = { productMediaPreviews: vi.fn().mockResolvedValue({ previews: {} }) };
    const controller = new AdminController(adminService as any);
    const descriptor = Object.getOwnPropertyDescriptor(
      AdminController.prototype,
      'productMediaPreviews',
    );

    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor!.value) ?? [],
    ).not.toContain(TenantDatabaseContextInterceptor);

    await controller.productMediaPreviews('product-1', admin);

    expect(adminService.productMediaPreviews).toHaveBeenCalledWith('product-1', {
      sub: admin.sub,
      role: admin.role,
      activeOrg: admin.activeOrg,
    });
  });

  it('retains request actor interception for admin product creation', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      AdminController.prototype,
      'adminCreateProduct',
    );
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor!.value) ?? [],
    ).toContain(TenantDatabaseContextInterceptor);
  });
});
