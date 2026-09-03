import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService, TrackInput } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/guards/current-user.decorator';

/**
 * Analytics controller — 4 endpoints
 *
 * - POST /v1/analytics/track        — track single event (client SDK)
 * - POST /v1/analytics/track/batch  — track batch of events
 * - GET  /v1/analytics/events       — event counts by type (admin)
 * - GET  /v1/analytics/activity     — user activity feed
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  async track(
    @CurrentUser() user: { sub: string; activeOrg: string | null },
    @Body() body: { eventType: string; sessionId?: string; properties?: Record<string, unknown>; device?: string },
  ) {
    return this.analyticsService.track({
      eventType: body.eventType,
      userId: user.sub,
      orgId: user.activeOrg || undefined,
      sessionId: body.sessionId,
      properties: body.properties,
      device: body.device,
    });
  }

  @Post('track/batch')
  async trackBatch(
    @CurrentUser() user: { sub: string; activeOrg: string | null },
    @Body() body: { events: Array<{ eventType: string; sessionId?: string; properties?: Record<string, unknown>; device?: string }> },
  ) {
    const events: TrackInput[] = body.events.map((e) => ({
      eventType: e.eventType,
      userId: user.sub,
      orgId: user.activeOrg || undefined,
      sessionId: e.sessionId,
      properties: e.properties,
      device: e.device,
    }));
    return this.analyticsService.trackBatch(events);
  }

  @Get('events')
  async eventCounts(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analyticsService.getEventCounts(from, to);
  }

  @Get('activity')
  async userActivity(
    @CurrentUser() user: { sub: string },
    @Query('limit') limit?: string,
  ) {
    return this.analyticsService.getUserActivity(user.sub, limit ? parseInt(limit, 10) : 50);
  }
}
