import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';

/**
 * Organizations controller — CRUD for organizations and membership.
 *
 * Endpoints:
 *   POST   /v1/organizations              — create org
 *   POST   /v1/organizations/join         — join an existing org by invite code
 *   GET    /v1/organizations/:id          — get org details
 *   PATCH  /v1/organizations/:id          — update org
 *   POST   /v1/organizations/:id/members  — add member
 *   GET    /v1/organizations/:id/members  — list members
 *   DELETE /v1/organizations/:id/members/:userId — remove member
 *   GET    /v1/organizations/:id/member-lookup?q= — lookup user by phone/email
 *   GET    /v1/roles                      — list available roles
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly identityService: IdentityService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('identity:organizations:write')
  async createOrg(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; type: string; country: string; legalName?: string; taxId?: string },
  ) {
    return this.identityService.createOrg(body, user.sub);
  }

  @Post('join')
  async joinOrg(
    @CurrentUser() user: JwtPayload,
    @Body() body: { code: string },
  ) {
    return this.identityService.joinOrgByInvite(user.sub, body.code);
  }

  @Get(':id')
  async getOrg(@Param('id') id: string) {
    return this.identityService.getOrg(id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('identity:organizations:write')
  async updateOrg(
    @Param('id') id: string,
    @Body() body: { name?: string; legalName?: string; taxId?: string },
  ) {
    return this.identityService.updateOrg(id, body);
  }

  @Post(':id/members')
  @UseGuards(PermissionsGuard)
  @RequirePermission('identity:organizations:write')
  async addMember(
    @Param('id') orgId: string,
    @Body() body: { userId: string; roleId: string },
  ) {
    return this.identityService.addOrgMember(orgId, body.userId, body.roleId);
  }

  @Get(':id/members')
  async listMembers(@Param('id') orgId: string) {
    return this.identityService.listOrgMembers(orgId);
  }

  @Delete(':id/members/:userId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('identity:organizations:write')
  async removeMember(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.identityService.removeOrgMember(orgId, userId);
  }

  @Get(':id/member-lookup')
  async lookupMember(@Param('id') orgId: string, @Req() req: any) {
    const query = req.query.q || '';
    return this.identityService.lookupUser(query);
  }
}

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  async listRoles() {
    return this.identityService.listRoles();
  }
}
