import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileController } from '../../../modules/identity/profile.controller';
import { IdentityService } from '../../../modules/identity/identity.service';
import { NotificationsService } from '../../../modules/notifications/notifications.service';
import { CatalogService } from '../../../modules/catalog/catalog.service';
import type { JwtPayload } from '../../../common/guards/current-user.decorator';

/**
 * ProfileController — delegation + contract unit tests.
 *
 * Locks the wiring the P1/P2 fixes rely on:
 *   - GET /v1/me forwards the caller's verified `activeOrg` so the projected
 *     `role` matches the active organization (ADM-B2 — the server, not a
 *     client-side JWT decode, is the source of truth for role).
 *   - GET /v1/me/sessions forwards the caller's `sid` claim (WEB-B3), so
 *     `isCurrent` is derived server-side and cannot be spoofed by a header.
 *   - favorites + saved-suppliers delegate to CatalogService (P1 §21.3).
 *
 * All three collaborators are mocked; only the controller adapter is exercised.
 */

function mocks() {
  const identity = {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    listUserOrgs: vi.fn(),
    setupCredentials: vi.fn(),
    changePassword: vi.fn(),
    getUserSessions: vi.fn(),
    revokeSessionsByDevice: vi.fn(),
  };
  const notifications = {
    registerDeviceToken: vi.fn(),
    unregisterDeviceToken: vi.fn(),
  };
  const catalog = {
    listFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    listSavedSuppliers: vi.fn(),
    saveSupplier: vi.fn(),
    removeSavedSupplier: vi.fn(),
  };
  return { identity, notifications, catalog };
}

const payload = (over: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  activeOrg: 'org-1',
  role: 'OWNER',
  perms: [],
  sid: 'sess-1',
  iat: 0,
  exp: 9999999999,
  ...over,
});

describe('ProfileController', () => {
  let m: ReturnType<typeof mocks>;
  let controller: ProfileController;

  beforeEach(() => {
    m = mocks();
    controller = new ProfileController(
      m.identity as unknown as IdentityService,
      m.notifications as unknown as NotificationsService,
      m.catalog as unknown as CatalogService,
    );
  });

  it('getProfile forwards sub + the verified activeOrg (ADM-B2 role source of truth)', async () => {
    await controller.getProfile(payload({ sub: 'u1', activeOrg: 'org-9' }));
    expect(m.identity.getProfile).toHaveBeenCalledWith('u1', 'org-9');
  });

  it('getProfile forwards a null activeOrg unchanged (no active organization)', async () => {
    await controller.getProfile(payload({ sub: 'u1', activeOrg: null }));
    expect(m.identity.getProfile).toHaveBeenCalledWith('u1', null);
  });

  it('updateProfile forwards sub + dto', async () => {
    const dto = { fullName: 'New Name' } as any;
    await controller.updateProfile(payload({ sub: 'u1' }), dto);
    expect(m.identity.updateProfile).toHaveBeenCalledWith('u1', dto);
  });

  it('getMyOrganizations forwards sub', async () => {
    await controller.getMyOrganizations(payload({ sub: 'u1' }));
    expect(m.identity.listUserOrgs).toHaveBeenCalledWith('u1');
  });

  it('registerDevice forwards token/platform/appVersion', async () => {
    await controller.registerDevice(payload({ sub: 'u1' }), {
      token: 'fcm-1',
      platform: 'FCM',
      appVersion: '1.0.0',
    });
    expect(m.notifications.registerDeviceToken).toHaveBeenCalledWith(
      'u1',
      'fcm-1',
      'FCM',
      '1.0.0',
    );
  });

  it('unregisterDevice forwards sub + token', async () => {
    await controller.unregisterDevice(payload({ sub: 'u1' }), 'fcm-1');
    expect(m.notifications.unregisterDeviceToken).toHaveBeenCalledWith('u1', 'fcm-1');
  });

  it('favorites delegate to the catalog service', async () => {
    await controller.getFavorites(payload({ sub: 'u1' }));
    await controller.addFavorite(payload({ sub: 'u1' }), { productId: 'p1' });
    await controller.removeFavorite(payload({ sub: 'u1' }), 'p1');
    expect(m.catalog.listFavorites).toHaveBeenCalledWith('u1');
    expect(m.catalog.addFavorite).toHaveBeenCalledWith('u1', 'p1');
    expect(m.catalog.removeFavorite).toHaveBeenCalledWith('u1', 'p1');
  });

  it('saved suppliers delegate to the catalog service (§21.3)', async () => {
    await controller.getSavedSuppliers(payload({ sub: 'u1' }));
    await controller.saveSupplier(payload({ sub: 'u1' }), { storeId: 's1' });
    await controller.removeSavedSupplier(payload({ sub: 'u1' }), 's1');
    expect(m.catalog.listSavedSuppliers).toHaveBeenCalledWith('u1');
    expect(m.catalog.saveSupplier).toHaveBeenCalledWith('u1', 's1');
    expect(m.catalog.removeSavedSupplier).toHaveBeenCalledWith('u1', 's1');
  });

  it('setupCredentials forwards sub/email/password + device header', async () => {
    await controller.setupCredentials(
      payload({ sub: 'u1' }),
      { email: 'a@b.c', password: 'pw' } as any,
      'dev-1',
    );
    expect(m.identity.setupCredentials).toHaveBeenCalledWith('u1', 'a@b.c', 'pw', 'dev-1');
  });

  it('changePassword forwards sub/current/new + device header', async () => {
    await controller.changePassword(
      payload({ sub: 'u1' }),
      { currentPassword: 'old', newPassword: 'new' } as any,
      'dev-1',
    );
    expect(m.identity.changePassword).toHaveBeenCalledWith('u1', 'old', 'new', 'dev-1');
  });

  it('getSessions forwards sub + the caller sid (WEB-B3, non-spoofable)', async () => {
    await controller.getSessions(payload({ sub: 'u1', sid: 'sess-7' }));
    expect(m.identity.getUserSessions).toHaveBeenCalledWith('u1', 'sess-7');
  });

  it('revokeSessionsByDevice forwards sub + deviceId', async () => {
    await controller.revokeSessionsByDevice(payload({ sub: 'u1' }), 'dev-1');
    expect(m.identity.revokeSessionsByDevice).toHaveBeenCalledWith('u1', 'dev-1');
  });
});
