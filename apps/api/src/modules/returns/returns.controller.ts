/**
 * P13 Returns Controller
 *
 * API endpoints for return request lifecycle:
 * - Buyer: create, view, cancel, mark shipped
 * - Merchant: approve/reject, receive, inspect
 * - Admin: oversight, expire, all returns list
 */
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Req, BadRequestException,
} from '@nestjs/common';
import { ReturnsService, CreateReturnInput, TransitionInput } from './returns.service';
import { BusinessCalendarService } from './business-calendar.service';
import { SettlementAdjustmentService, CreateAdjustmentInput } from './settlement-adjustment.service';
import { ReconciliationService } from './reconciliation.service';
import { CommissionReversalService } from './commission-reversal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';
import { CallerContext } from '../../common/tenant-scope';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly calendar: BusinessCalendarService,
    private readonly settlementAdj: SettlementAdjustmentService,
    private readonly reconciliation: ReconciliationService,
    private readonly commissionReversal: CommissionReversalService,
  ) {}

  // ── Buyer Endpoints ───────────────────────────────────────────

  /** POST /v1/returns — buyer creates a return request. */
  @Post('returns')
  async createReturn(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateReturnInput & { idempotencyKey?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.createReturnRequest(body, caller);
  }

  /** GET /v1/returns/my — buyer lists own returns. Declared before :id so the
   *  literal 'my' is not swallowed by the parameterized route. */
  @Get('returns/my')
  async myReturns(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.returns.listReturnsForBuyer(user.sub, status);
  }

  /** GET /v1/returns/:id — view return request (buyer owns it, merchant store member, or admin). */
  @Get('returns/:id')
  async getReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.getReturnRequest(id, caller);
  }

  /** POST /v1/returns/:id/cancel — buyer cancels return. */
  @Post('returns/:id/cancel')
  async cancelReturn(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'CANCELLED', caller);
  }

  /** POST /v1/returns/:id/shipped — buyer confirms handover. */
  @Post('returns/:id/shipped')
  async markShipped(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { trackingNumber?: string; notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'BUYER_SHIPPED', caller, body);
  }

  // ── Merchant Endpoints ────────────────────────────────────────

  /** GET /v1/merchant/returns — merchant lists returns for their stores. */
  @Get('merchant/returns')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:read')
  async merchantReturns(
    @CurrentUser() user: JwtPayload,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
  ) {
    if (!storeId) throw new BadRequestException('storeId query parameter is required');
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.listReturnsForStore(storeId, caller, status);
  }

  /** POST /v1/merchant/returns/:id/approve — merchant approves return. */
  @Post('merchant/returns/:id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async approveReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'MERCHANT_APPROVED', caller, body);
  }

  /** POST /v1/merchant/returns/:id/reject — merchant rejects return. */
  @Post('merchant/returns/:id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async rejectReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'MERCHANT_REJECTED', caller, body);
  }

  /** POST /v1/merchant/returns/:id/receive — merchant confirms receipt. */
  @Post('merchant/returns/:id/receive')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async receiveReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'RECEIVED', caller);
  }

  /** POST /v1/merchant/returns/:id/inspect — merchant records inspection. */
  @Post('merchant/returns/:id/inspect')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async inspectReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { condition: string; notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'INSPECTED', caller, body);
  }

  /** POST /v1/merchant/returns/:id/reject-inspection — reject after inspection. */
  @Post('merchant/returns/:id/reject-inspection')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async rejectAfterInspection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'REJECTED_AFTER_INSPECTION', caller, body);
  }

  // ── Admin Endpoints ───────────────────────────────────────────

  /** GET /v1/admin/returns — admin lists all returns. */
  @Get('admin/returns')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async adminReturns(@Query('status') status?: string) {
    return this.returns.listAllReturns(status);
  }

  /** POST /v1/admin/returns/:id/expire — admin expires a return. */
  @Post('admin/returns/:id/expire')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async expireReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'EXPIRED', caller);
  }

  /** POST /v1/admin/returns/:id/issue-refund — drives the locked INSPECTED → REFUND_PENDING system transition (creates the P12 refund request). */
  @Post('admin/returns/:id/issue-refund')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:refunds:approve')
  async issueRefund(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller: CallerContext = { sub: user.sub, role: 'ADMIN', activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'REFUND_PENDING', caller);
  }

  /** POST /v1/admin/returns/:id/mark-refunded — admin marks refund completed. */
  @Post('admin/returns/:id/mark-refunded')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:refunds:approve')
  async markRefunded(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const caller: CallerContext = { sub: user.sub, role: 'ADMIN', activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'REFUNDED', caller);
  }

  /** POST /v1/admin/returns/:id/refund-failed — admin marks refund failed. */
  @Post('admin/returns/:id/refund-failed')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:refunds:approve')
  async markRefundFailed(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: 'ADMIN', activeOrg: user.activeOrg };
    return this.returns.transitionReturn(id, 'REFUND_FAILED', caller, body);
  }

  // ── P13 Phase 2: Admin Resolution of Escalated Returns ──────

  /** POST /v1/admin/returns/:id/resolve — admin resolves an escalated return. */
  @Post('admin/returns/:id/resolve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async resolveEscalated(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      action: 'APPROVE' | 'REJECT' | 'CANCEL';
      responsibilityCategory?: string;
      notes?: string;
    },
  ) {
    if (!body.action || !['APPROVE', 'REJECT', 'CANCEL'].includes(body.action)) {
      throw new BadRequestException('action must be APPROVE, REJECT, or CANCEL');
    }
    const caller: CallerContext = { sub: user.sub, role: 'ADMIN', activeOrg: user.activeOrg };
    return this.returns.resolveEscalation(
      id, body.action, body.responsibilityCategory || null, caller, body.notes,
    );
  }

  // ── P13 Phase 2: Business Calendar Administration ──────────────

  /** GET /v1/admin/business-calendars — list all calendars. */
  @Get('admin/business-calendars')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async listCalendars() {
    return this.calendar.listCalendars();
  }

  /** GET /v1/admin/business-calendars/default — get the effective default calendar. */
  @Get('admin/business-calendars/default')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async getDefaultCalendar() {
    return this.calendar.loadDefaultCalendar();
  }

  /** POST /v1/admin/business-calendars — create a new calendar. */
  @Post('admin/business-calendars')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async createCalendar(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      name: string; timezone?: string; startTime?: string; endTime?: string;
      workingDays?: number[]; isDefault?: boolean;
    },
  ) {
    if (!body.name || body.name.trim().length === 0) {
      throw new BadRequestException('Calendar name is required');
    }
    return this.calendar.createCalendar(body, user.sub);
  }

  /** PATCH /v1/admin/business-calendars/:id — update calendar settings. */
  @Patch('admin/business-calendars/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async updateCalendar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      name?: string; timezone?: string; startTime?: string; endTime?: string;
      workingDays?: number[]; isDefault?: boolean; enabled?: boolean;
    },
  ) {
    return this.calendar.updateCalendar(id, body, user.sub);
  }

  /** POST /v1/admin/business-calendars/:id/holidays — add a holiday. */
  @Post('admin/business-calendars/:id/holidays')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async addHoliday(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { holidayDate: string; description?: string },
  ) {
    if (!body.holidayDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.holidayDate)) {
      throw new BadRequestException('holidayDate must be YYYY-MM-DD format');
    }
    return this.calendar.addHoliday(id, body.holidayDate, body.description || null, user.sub);
  }

  /** DELETE /v1/admin/business-calendars/:id/holidays/:date — remove a holiday. */
  @Delete('admin/business-calendars/:id/holidays/:date')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:write')
  async removeHoliday(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('date') date: string,
  ) {
    return this.calendar.removeHoliday(id, date, user.sub);
  }

  /** GET /v1/admin/business-calendars/:id/holidays — list holidays. */
  @Get('admin/business-calendars/:id/holidays')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async listHolidays(@Param('id') id: string) {
    return this.calendar.listHolidays(id);
  }

  /** GET /v1/admin/business-calendars/:id/audit — list audit entries. */
  @Get('admin/business-calendars/:id/audit')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:returns:read')
  async listCalendarAudit(@Param('id') id: string) {
    return this.calendar.listAudit(id);
  }

  // ── P13 Phase 3: Commission Reversal Oversight ──────────────────

  /** GET /v1/admin/commission-reversals — list reversals. */
  @Get('admin/commission-reversals')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:commission:read')
  async listCommissionReversals(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.commissionReversal.listReversals(user.activeOrg, status);
  }

  // ── P13 Phase 3: Settlement Adjustment Administration ────────────

  /** GET /v1/admin/settlement-adjustments — list adjustments. */
  @Get('admin/settlement-adjustments')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:adjustments:read')
  async listAdjustments(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.settlementAdj.listAdjustments(user.activeOrg, status);
  }

  /** GET /v1/admin/settlement-adjustments/:id — get adjustment detail. */
  @Get('admin/settlement-adjustments/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:adjustments:read')
  async getAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.settlementAdj.getAdjustment(id, user.activeOrg);
  }

  /** POST /v1/admin/settlement-adjustments — create a new adjustment. */
  @Post('admin/settlement-adjustments')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:adjustments:write')
  async createAdjustment(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateAdjustmentInput,
  ) {
    return this.settlementAdj.createAdjustment(body, user.sub, user.activeOrg);
  }

  /** POST /v1/admin/settlement-adjustments/:id/submit — submit for approval. */
  @Post('admin/settlement-adjustments/:id/submit')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:adjustments:write')
  async submitAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.settlementAdj.submitForApproval(id, user.sub, user.activeOrg);
  }

  /** POST /v1/admin/settlement-adjustments/:id/approve — approve adjustment. */
  @Post('admin/settlement-adjustments/:id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:adjustments:approve')
  async approveAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.settlementAdj.approveAdjustment(
      id, user.sub, user.role, { approverRole: user.role, notes: body.notes }, user.activeOrg,
    );
  }

  /** POST /v1/admin/settlement-adjustments/:id/reject — reject adjustment. */
  @Post('admin/settlement-adjustments/:id/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:adjustments:approve')
  async rejectAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    if (!body.reason) throw new BadRequestException('Rejection reason is required');
    return this.settlementAdj.rejectAdjustment(id, user.sub, body.reason, user.activeOrg);
  }

  /** POST /v1/admin/settlement-adjustments/:id/post — post approved adjustment. */
  @Post('admin/settlement-adjustments/:id/post')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:adjustments:approve')
  async postAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.settlementAdj.postAdjustment(id, user.sub, user.activeOrg);
  }

  // ── P13 Phase 3: Reconciliation Administration ──────────────────

  /** GET /v1/admin/reconciliation — list reconciliation runs. */
  @Get('admin/reconciliation')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:reconciliation:read')
  async listReconciliationRuns(@CurrentUser() user: JwtPayload) {
    return this.reconciliation.listReconciliationRuns(user.activeOrg);
  }

  /** GET /v1/admin/reconciliation/:id — get run with discrepancies. */
  @Get('admin/reconciliation/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:reconciliation:read')
  async getReconciliationRun(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.reconciliation.getReconciliationRun(id, user.activeOrg);
  }

  /** POST /v1/admin/reconciliation/run — execute reconciliation for a period. */
  @Post('admin/reconciliation/run')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:reconciliation:write')
  async runReconciliation(
    @CurrentUser() user: JwtPayload,
    @Body() body: { periodStart: string; periodEnd: string; currency?: string },
  ) {
    if (!body.periodStart || !body.periodEnd) {
      throw new BadRequestException('periodStart and periodEnd are required (YYYY-MM-DD)');
    }
    return this.reconciliation.executeReconciliation(
      body.periodStart, body.periodEnd, body.currency ?? 'SYP', user.sub, user.activeOrg,
    );
  }

  /** POST /v1/admin/reconciliation/discrepancies/:id/resolve — resolve a discrepancy. */
  @Post('admin/reconciliation/discrepancies/:id/resolve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:reconciliation:write')
  async resolveDiscrepancy(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes: string },
  ) {
    if (!body.notes) throw new BadRequestException('Resolution notes are required');
    return this.reconciliation.resolveDiscrepancy(id, user.sub, body.notes, user.activeOrg);
  }
}
