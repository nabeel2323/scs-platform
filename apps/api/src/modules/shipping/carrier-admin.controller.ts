import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser, JwtPayload, RequirePermission,
} from '../../common/guards/current-user.decorator';
import { CarrierCredentialsService, CreateCarrierCredentialInput } from './carrier-credentials.service';
import { CarrierConfigurationsService, CreateCarrierConfigurationInput, UpdateCarrierConfigurationInput } from './carrier-configurations.service';

/**
 * CarrierAdminController — M7.2.3-A carrier credential & configuration management.
 *
 * Endpoints:
 *   Carrier Credentials:
 *     GET    /v1/carrier/credentials?orgId=            — list (masked)
 *     GET    /v1/carrier/credentials/:id               — get (masked)
 *     POST   /v1/carrier/credentials                    — create
 *     POST   /v1/carrier/credentials/:id/deactivate     — soft-delete
 *
 *   Carrier Configurations:
 *     GET    /v1/carrier/configurations?orgId=          — list
 *     GET    /v1/carrier/configurations/:id             — get
 *     POST   /v1/carrier/configurations                 — create
 *     PATCH  /v1/carrier/configurations/:id             — update
 *     POST   /v1/carrier/configurations/:id/deactivate  — soft-delete
 *
 * SECURITY:
 *   - Plaintext credentials NEVER appear in responses.
 *   - Only SUPER_ADMIN/ADMIN can manage credentials.
 *   - Merchant owners can manage configurations (with org-scoping).
 *   - Org A cannot access Org B's data.
 */
@Controller('v1/carrier')
@UseGuards(JwtAuthGuard)
export class CarrierAdminController {
  constructor(
    private readonly credentials: CarrierCredentialsService,
    private readonly configurations: CarrierConfigurationsService,
  ) {}

  // ── Credentials ───────────────────────────────────────────────────────

  @Get('credentials')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async listCredentials(
    @CurrentUser() user: JwtPayload,
    @Query('orgId') orgId: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    const items = await this.credentials.listForOrg(orgId, caller);
    return { credentials: items };
  }

  @Get('credentials/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async getCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.credentials.getById(id, caller);
  }

  @Post('credentials')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  async createCredential(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateCarrierCredentialInput,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.credentials.create(body, caller);
  }

  @Post('credentials/:id/deactivate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  @HttpCode(200)
  async deactivateCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.credentials.deactivate(id, caller);
  }

  // ── Configurations ────────────────────────────────────────────────────

  @Get('configurations')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async listConfigurations(
    @CurrentUser() user: JwtPayload,
    @Query('orgId') orgId: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    const items = await this.configurations.listForOrg(orgId, caller);
    return { configurations: items };
  }

  @Get('configurations/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async getConfiguration(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.getById(id, caller);
  }

  @Post('configurations')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  async createConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateCarrierConfigurationInput,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.create(body, caller);
  }

  @Patch('configurations/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  async updateConfiguration(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateCarrierConfigurationInput,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.update(id, body, caller);
  }

  @Post('configurations/:id/deactivate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  @HttpCode(200)
  async deactivateConfiguration(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.deactivate(id, caller);
  }
}
