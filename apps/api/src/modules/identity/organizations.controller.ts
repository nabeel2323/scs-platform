import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

/**
 * Organizations controller — CRUD for organizations and membership.
 *
 * Endpoints:
 *   POST   /v1/organizations              — create org
 *   GET    /v1/organizations/:id          — get org details
 *   PATCH  /v1/organizations/:id          — update org
 *   POST   /v1/organizations/:id/members  — add member
 *   GET    /v1/organizations/:id/members  — list members
 *   DELETE /v1/organizations/:id/members/:userId — remove member
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly identityService: IdentityService) {}

  @Post()
  async createOrg(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; type: string; country: string; legalName?: string; taxId?: string },
  ) {
    return this.identityService.createOrg(body, user.sub);
  }

  @Get(':id')
  async getOrg(@Param('id') id: string) {
    return this.identityService.getOrg(id);
  }

  @Patch(':id')
  async updateOrg(
    @Param('id') id: string,
    @Body() body: { name?: string; legalName?: string; taxId?: string },
  ) {
    return this.identityService.updateOrg(id, body);
  }

  @Post(':id/members')
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
  async removeMember(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.identityService.removeOrgMember(orgId, userId);
  }
}
