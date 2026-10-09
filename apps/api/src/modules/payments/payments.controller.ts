/**
 * P12 Payments Controller
 *
 * API endpoints for payment operations:
 * - Buyer: submit proof, view payment status
 * - Merchant: confirm COD cash
 * - Admin: verify/reject payments, approve refunds, manage settlements
 *
 * All endpoints are guarded by JwtAuthGuard. Object-level authorization
 * is enforced in the service layer (tenant isolation per architecture §23).
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';
import { CallerContext, assertOrderAccessible } from '../../common/tenant-scope';
import { DatabaseService } from '../../common/database/database.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly db: DatabaseService,
  ) {}

  // ── Buyer Endpoints ───────────────────────────────────────────

  /** GET /v1/payments/:id — view payment details (buyer owns it or admin). */
  @Get('payments/:id')
  async getPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const payment = await this.payments.getPaymentOrThrow(id);
    const order = await this.payments.getOrderForPayment(payment.orderId);
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    await assertOrderAccessible(this.db, caller, order);
    const events = await this.payments.getPaymentEvents(id);
    const refundsList = await this.payments.listRefunds(id);
    return { ...payment, events, refunds: refundsList };
  }

  /** POST /v1/payments/:id/proof — buyer uploads bank transfer receipt. */
  @Post('payments/:id/proof')
  @UseGuards(PermissionsGuard)
  @RequirePermission('orders:write')
  async submitProof(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { receiptUrl?: string; receiptReference?: string; notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.payments.submitProof(id, user.sub, body, caller);
  }

  /** POST /v1/payments/:id/confirm-cash — merchant confirms COD cash collection. */
  @Post('payments/:id/confirm-cash')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:write')
  async confirmCash(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { amountCollectedMinor?: number; notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.payments.confirmCash(id, user.sub, caller, body);
  }

  /** POST /v1/payments/:id/refund — buyer requests a refund. */
  @Post('payments/:id/refund')
  @UseGuards(PermissionsGuard)
  @RequirePermission('orders:write')
  async requestRefund(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { amountMinor: number; reason: string; idempotencyKey?: string; notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.payments.requestRefund(
      id, body.amountMinor, body.reason, user.sub, caller,
      { idempotencyKey: body.idempotencyKey, notes: body.notes },
    );
  }

  // ── Admin Endpoints ───────────────────────────────────────────

  /** POST /v1/admin/payments/:id/verify — admin confirms or rejects proof. */
  @Post('admin/payments/:id/verify')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:payments:verify')
  async verifyPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { decision: 'CONFIRMED' | 'REJECTED'; notes?: string; verifiedAmountMinor?: number },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.payments.verifyPayment(id, body.decision, user.sub, caller, {
      notes: body.notes,
      verifiedAmountMinor: body.verifiedAmountMinor,
    });
  }

  /** POST /v1/admin/refunds/:id/approve — admin approves a refund. */
  @Post('admin/refunds/:id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:refunds:approve')
  async approveRefund(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.payments.approveRefund(id, user.sub, caller);
  }

  /** GET /v1/admin/payments — list all payments (admin). */
  @Get('admin/payments')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:payments:read')
  async listPayments(
    @Query('status') status?: string,
    @Query('paymentMethod') paymentMethod?: string,
  ) {
    return this.payments.listPayments({ status, paymentMethod });
  }

  /** GET /v1/admin/payments/verification-queue — pending proofs. */
  @Get('admin/payments/verification-queue')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:payments:verify')
  async verificationQueue() {
    return this.payments.getVerificationQueue();
  }

  /** GET /v1/admin/payments/stale — reconciliation: stale payments. */
  @Get('admin/payments/stale')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:payments:read')
  async stalePayments() {
    return this.payments.getStalePayments();
  }

  /** POST /v1/admin/settlements/:id/calculate — calculate settlement. */
  @Post('admin/settlements/:id/calculate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:settlements:write')
  async calculateSettlement(
    @CurrentUser() user: JwtPayload,
    @Param('id') orderId: string,
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.payments.calculateSettlement(orderId, user.sub, caller);
  }

  /** POST /v1/admin/settlements/:id/pay — mark settlement as paid. */
  @Post('admin/settlements/:id/pay')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:settlements:write')
  async markSettlementPaid(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { paymentReference?: string; notes?: string },
  ) {
    const caller: CallerContext = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.payments.markSettlementPaid(id, user.sub, caller, body);
  }

  /** GET /v1/admin/settlements — list settlements. */
  @Get('admin/settlements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:settlements:read')
  async listSettlements(
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
  ) {
    return this.payments.listSettlements({ storeId, status });
  }

  // ── Merchant Endpoints ────────────────────────────────────────

  /** GET /v1/merchant/payments — payments for merchant's stores. */
  @Get('merchant/payments')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:read')
  async merchantListPayments(
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
  ) {
    return this.payments.listPayments({ storeId, status });
  }

  /** GET /v1/merchant/settlements — settlements for merchant's stores. */
  @Get('merchant/settlements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('merchant:orders:read')
  async merchantSettlements(
    @CurrentUser() user: JwtPayload,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
  ) {
    return this.payments.listSettlements({ storeId, status });
  }
}
