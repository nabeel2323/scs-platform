import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser,
  JwtPayload,
  RequirePermission,
} from '../../common/guards/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  // ── Disputes ─────────────────────────────────────────────────

  @Post('orders/:orderId/dispute')
  async createDispute(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() body: { againstId: string; reason: string },
  ) {
    return this.disputesService.createDispute({
      orderId,
      raisedBy: user.sub,
      againstId: body.againstId,
      reason: body.reason,
    });
  }

  @Get('disputes')
  async listDisputes(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.disputesService.listDisputes(user.sub, status);
  }

  @Get('disputes/:id')
  async getDispute(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.disputesService.getDispute(id, {
      sub: user.sub,
      role: user.role,
      activeOrg: user.activeOrg,
    });
  }

  @Get('disputes/:id/events')
  async getDisputeEvents(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.disputesService.getDisputeEvents(id, {
      sub: user.sub,
      role: user.role,
      activeOrg: user.activeOrg,
    });
  }

  @Post('disputes/:id/evidence')
  async submitEvidence(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { body: string; attachments?: string[] },
  ) {
    return this.disputesService.submitEvidence(id, user.sub, body.body, body.attachments);
  }

  @Post('disputes/:id/response')
  async submitResponse(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.disputesService.submitResponse(id, user.sub, body.body, {
      sub: user.sub,
      role: user.role,
      activeOrg: user.activeOrg,
    });
  }

  @Patch('disputes/:id/resolve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('support:disputes:resolve')
  async resolveDispute(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { resolution: string },
  ) {
    return this.disputesService.resolveDispute(id, user.sub, body.resolution, {
      sub: user.sub,
      role: user.role,
      activeOrg: user.activeOrg,
    });
  }

  // ── Conversations ────────────────────────────────────────────

  @Post('orders/:orderId/conversation')
  async createConversation(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() body: { participant2: string; participant1?: string },
  ) {
    return this.disputesService.createOrGetConversation(
      orderId,
      { sub: user.sub, role: user.role, activeOrg: user.activeOrg },
      body.participant2,
    );
  }

  @Get('conversations/:id')
  async getConversation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.disputesService.getConversation(id, {
      sub: user.sub,
      role: user.role,
      activeOrg: user.activeOrg,
    });
  }

  @Get('conversations/:id/messages')
  async getMessages(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.disputesService.getMessages(id, {
      sub: user.sub,
      role: user.role,
      activeOrg: user.activeOrg,
    });
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.disputesService.sendMessage(id, user.sub, body.body);
  }

  @Patch('conversations/:id/read')
  async markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.disputesService.markMessagesRead(id, user.sub);
  }
}
