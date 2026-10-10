/**
 * P13 Returns Controller
 *
 * API endpoints for return request lifecycle:
 * - Buyer: create, view, cancel, mark shipped
 * - Merchant: approve/reject, receive, inspect
 * - Admin: oversight, expire, all returns list
 */
import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, Req, BadRequestException,
} from '@nestjs/common';
import { ReturnsService, CreateReturnInput, TransitionInput } from './returns.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser, JwtPayload, RequirePermission } from '../../common/guards/current-user.decorator';
import { CallerContext } from '../../common/tenant-scope';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

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
}
