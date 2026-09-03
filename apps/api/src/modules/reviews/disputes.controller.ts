import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { DisputesService, CreateDisputeInput } from './disputes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

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
  async listDisputes(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.disputesService.listDisputes(user.sub, status);
  }

  @Get('disputes/:id')
  async getDispute(@Param('id') id: string) {
    return this.disputesService.getDispute(id);
  }

  @Get('disputes/:id/events')
  async getDisputeEvents(@Param('id') id: string) {
    return this.disputesService.getDisputeEvents(id);
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
    return this.disputesService.submitResponse(id, user.sub, body.body);
  }

  @Patch('disputes/:id/resolve')
  async resolveDispute(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { resolution: string },
  ) {
    return this.disputesService.resolveDispute(id, user.sub, body.resolution);
  }

  // ── Conversations ────────────────────────────────────────────

  @Post('orders/:orderId/conversation')
  async createConversation(
    @Param('orderId') orderId: string,
    @Body() body: { participant1: string; participant2: string },
  ) {
    return this.disputesService.createOrGetConversation(orderId, body.participant1, body.participant2);
  }

  @Get('conversations/:id')
  async getConversation(@Param('id') id: string) {
    return this.disputesService.getConversation(id);
  }

  @Get('conversations/:id/messages')
  async getMessages(@Param('id') id: string) {
    return this.disputesService.getMessages(id);
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
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.disputesService.markMessagesRead(id, user.sub);
  }
}
