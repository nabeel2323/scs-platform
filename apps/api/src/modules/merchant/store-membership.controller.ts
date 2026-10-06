import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { StoreMembershipService } from './store-membership.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';
import { DatabaseService } from '../../common/database/database.service';
import { stores, storeMembers } from './merchant.schema';
import { eq, and } from 'drizzle-orm';
import { assertStoreInOrg, isTenantPrivileged, type CallerContext } from '../../common/tenant-scope';

/**
 * Store Membership API (P7)
 *
 * Routes:
 *   GET    /stores/:storeId/members           — list members
 *   GET    /stores/:storeId/members/eligible   — list eligible users to add
 *   POST   /stores/:storeId/members            — add member
 *   DELETE /stores/:storeId/members/:userId    — remove member
 *   PATCH  /stores/:storeId/members/:userId/role      — change role
 *   PATCH  /stores/:storeId/members/:userId/activate  — activate
 *   PATCH  /stores/:storeId/members/:userId/deactivate — deactivate
 */
@Controller('stores/:storeId/members')
@UseGuards(JwtAuthGuard)
export class StoreMembershipController {
  constructor(
    private readonly membershipService: StoreMembershipService,
    private readonly db: DatabaseService,
  ) {}

  private buildCaller(user: JwtPayload): CallerContext {
    return { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
  }

  /**
   * Resolve store and verify org-level access.
   * Returns the store's orgId for further authorization.
   */
  private async resolveStore(storeId: string, caller: CallerContext) {
    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { id: true, orgId: true },
    });
    if (!store) throw new ForbiddenException('Store not found');
    await assertStoreInOrg(this.db, caller, storeId);
    return store;
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:read')
  async listMembers(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.buildCaller(user);
    const store = await this.resolveStore(storeId, caller);

    // Privileged roles and store members can view
    if (!isTenantPrivileged(caller)) {
      const membership = await this.db.db.query.storeMembers.findFirst({
        where: and(
          eq(storeMembers.storeId, storeId),
          eq(storeMembers.userId, caller.sub),
          eq(storeMembers.status, 'ACTIVE'),
        ),
        columns: { id: true },
      });
      if (!membership) {
        throw new ForbiddenException('You are not an active member of this store');
      }
    }

    return this.membershipService.listMembers(storeId);
  }

  @Get('eligible')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async listEligibleUsers(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.buildCaller(user);
    const store = await this.resolveStore(storeId, caller);

    // Only membership managers can see eligible users
    await this.membershipService.assertCanManageMembers(storeId, caller);

    return this.membershipService.listEligibleUsers(storeId, store.orgId);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async addMember(
    @Param('storeId') storeId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { userId: string; role: string },
  ) {
    const caller = this.buildCaller(user);
    await this.resolveStore(storeId, caller);

    // Authorization check
    await this.membershipService.assertCanManageMembers(storeId, caller);
    await this.membershipService.assertCanModifyMember(
      storeId, caller, body.userId, 'add', undefined, body.role,
    );

    return this.membershipService.addMember(storeId, body.userId, body.role, caller);
  }

  @Delete(':userId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async removeMember(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.buildCaller(user);
    await this.resolveStore(storeId, caller);

    await this.membershipService.assertCanManageMembers(storeId, caller);
    await this.membershipService.assertCanModifyMember(
      storeId, caller, userId, 'remove',
    );

    return this.membershipService.removeMember(storeId, userId, caller);
  }

  @Patch(':userId/role')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async changeRole(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { role: string },
  ) {
    const caller = this.buildCaller(user);
    await this.resolveStore(storeId, caller);

    await this.membershipService.assertCanManageMembers(storeId, caller);

    // Get target's current role for authorization
    const target = await this.membershipService.getMember(storeId, userId);
    await this.membershipService.assertCanModifyMember(
      storeId, caller, userId, 'role_change', target.role, body.role,
    );

    return this.membershipService.changeRole(storeId, userId, body.role, caller);
  }

  @Patch(':userId/activate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async activateMember(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.buildCaller(user);
    await this.resolveStore(storeId, caller);

    await this.membershipService.assertCanManageMembers(storeId, caller);
    await this.membershipService.assertCanModifyMember(
      storeId, caller, userId, 'activate',
    );

    return this.membershipService.activateMember(storeId, userId, caller);
  }

  @Patch(':userId/deactivate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:products:write')
  async deactivateMember(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.buildCaller(user);
    await this.resolveStore(storeId, caller);

    await this.membershipService.assertCanManageMembers(storeId, caller);
    await this.membershipService.assertCanModifyMember(
      storeId, caller, userId, 'deactivate',
    );

    return this.membershipService.deactivateMember(storeId, userId, caller);
  }
}
