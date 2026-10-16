/**
 * P13 Phase 4 — Operations control endpoints.
 *
 * Permission choice: these routes reuse the existing `admin:returns:read` /
 * `admin:returns:write` keys rather than minting new RBAC keys. Per seed-pg.ts
 * those keys belong to SUPER_ADMIN and ADMIN only, which is exactly the audience
 * for worker and pilot controls, and it keeps the Phase 3 permission inventory
 * (87 keys / 8 roles) stable. Adding keys here would be an unreviewed change to
 * the authorization baseline that other suites assert on.
 *
 * Nothing here can approve a refund, post an adjustment, or bypass a lease:
 * pause/resume and pilot configuration only.
 */

import {
  BadRequestException, Body, Controller, Get, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';
import { OpsAlertService } from './ops-alert.service';
import { OpsControlService } from './ops-control.service';
import { P13MonitorService } from './p13-monitor.service';
import { PilotControlService } from './pilot-control.service';
import { WorkerLeaseService } from './worker-lease.service';
import { P13_LEASE_KEY, P13_PAUSE_CONTROL_KEY } from './p13-ops.config';

interface PauseBody {
  reason?: string;
}

interface PilotFlagBody {
  enabled?: boolean;
  description?: string;
}

interface AllowlistBody {
  orgId?: string;
  storeId?: string | null;
  note?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('admin/ops/p13')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(
    private readonly leases: WorkerLeaseService,
    private readonly controls: OpsControlService,
    private readonly alerts: OpsAlertService,
    private readonly monitor: P13MonitorService,
    private readonly pilot: PilotControlService,
  ) {}

  /** Single glance at worker ownership, pause state, alert rollup and pilot state. */
  @Get('status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async status() {
    const [lease, control, alertSnapshot, pilotSnapshot, holderCounts] = await Promise.all([
      this.leases.read(P13_LEASE_KEY),
      this.controls.state(P13_PAUSE_CONTROL_KEY),
      this.alerts.snapshot(),
      this.pilot.snapshot(),
      this.leases.liveHolderCounts(),
    ]);

    return {
      worker: {
        leaseKey: P13_LEASE_KEY,
        holder: lease?.holderId ?? null,
        holderHost: lease?.holderHost ?? null,
        holderPid: lease?.holderPid ?? null,
        epoch: lease?.epoch ?? 0,
        heartbeatAt: lease?.heartbeatAt ?? null,
        expiresAt: lease?.expiresAt ?? null,
        liveHolders: holderCounts.find((h) => h.leaseKey === P13_LEASE_KEY)?.liveHolders ?? 0,
        pollFailures: lease?.pollFailures ?? 0,
        lastErrorCode: lease?.lastErrorCode ?? null,
        lastJobAt: lease?.lastJobAt ?? null,
        lastJobSummary: lease?.lastJobSummary ?? null,
        thisInstance: this.leases.holderId,
      },
      control,
      alerts: alertSnapshot,
      pilot: pilotSnapshot,
    };
  }

  /** Alerts that still need attention. */
  @Get('alerts')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async openAlerts(@Query('limit') limit?: string) {
    return { alerts: await this.alerts.listOpen(clampLimit(limit)) };
  }

  /**
   * On-demand scan. Read-only with respect to business data: it evaluates the
   * ten conditions and records/delivers alerts exactly as the periodic scan does.
   */
  @Post('scan')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async scan() {
    return this.monitor.scan();
  }

  /** Pause P13 background processing. In-flight transactions are not interrupted. */
  @Post('worker/pause')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async pause(@CurrentUser() user: JwtPayload, @Body() body: PauseBody) {
    const reason = (body?.reason ?? '').trim();
    if (!reason) {
      throw new BadRequestException('A reason is required to pause P13 processing');
    }
    return this.controls.setPaused({ paused: true, reason, actorId: user.sub ?? null });
  }

  @Post('worker/resume')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async resume(@CurrentUser() user: JwtPayload, @Body() body: PauseBody) {
    return this.controls.setPaused({
      paused: false,
      reason: (body?.reason ?? 'resumed').trim(),
      actorId: user.sub ?? null,
    });
  }

  @Get('controls/history')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async controlHistory(@Query('limit') limit?: string) {
    return { changes: await this.controls.history(P13_PAUSE_CONTROL_KEY, clampLimit(limit)) };
  }

  @Get('pilot')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async pilotState() {
    return this.pilot.snapshot();
  }

  @Post('pilot/flag')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async setPilotFlag(@CurrentUser() user: JwtPayload, @Body() body: PilotFlagBody) {
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    await this.pilot.setFlag(body.enabled, user.sub ?? null, body.description);
    return this.pilot.snapshot();
  }

  @Post('pilot/allowlist')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async addAllowlist(@CurrentUser() user: JwtPayload, @Body() body: AllowlistBody) {
    assertOrgAndStore(body);
    await this.pilot.addAllowlistEntry({
      orgId: body.orgId as string,
      storeId: body.storeId ?? null,
      note: body.note ?? null,
      actorId: user.sub ?? null,
    });
    return this.pilot.snapshot();
  }

  @Post('pilot/allowlist/revoke')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async revokeAllowlist(@CurrentUser() user: JwtPayload, @Body() body: AllowlistBody) {
    assertOrgAndStore(body);
    const rowsAffected = await this.pilot.revokeAllowlistEntry({
      orgId: body.orgId as string,
      storeId: body.storeId ?? null,
      note: body.note ?? 'revoked',
      actorId: user.sub ?? null,
    });
    return { rowsAffected, pilot: await this.pilot.snapshot() };
  }
}

function assertOrgAndStore(body: AllowlistBody): void {
  if (!body?.orgId || !UUID_PATTERN.test(body.orgId)) {
    throw new BadRequestException('orgId must be a valid UUID');
  }
  if (body.storeId !== undefined && body.storeId !== null && !UUID_PATTERN.test(body.storeId)) {
    throw new BadRequestException('storeId must be a valid UUID or null');
  }
}

function clampLimit(value?: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}
