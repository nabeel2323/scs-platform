import { Controller, Get, Patch, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/guards/current-user.decorator';

/**
 * Notifications controller — 8 endpoints
 *
 * - GET    /v1/notifications              — list notifications
 * - GET    /v1/notifications/unread-count — unread count
 * - PATCH  /v1/notifications/:id/read     — mark as read
 * - PATCH  /v1/notifications/read-all     — mark all as read
 * - GET    /v1/notification-preferences   — get preferences
 * - PATCH  /v1/notification-preferences   — update preference
 * - POST   /v1/device-tokens              — register device token
 * - DELETE /v1/device-tokens/:token        — unregister device token
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications')
  async list(
    @CurrentUser() user: { sub: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationsService.listNotifications(
      user.sub,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('notifications/unread-count')
  async unreadCount(@CurrentUser() user: { sub: string }) {
    const count = await this.notificationsService.getUnreadCount(user.sub);
    return { count };
  }

  @Patch('notifications/:id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.notificationsService.markAsRead(id, user.sub);
  }

  @Patch('notifications/read-all')
  async markAllAsRead(@CurrentUser() user: { sub: string }) {
    return this.notificationsService.markAllAsRead(user.sub);
  }

  @Get('notification-preferences')
  async getPreferences(@CurrentUser() user: { sub: string }) {
    return this.notificationsService.getPreferences(user.sub);
  }

  @Patch('notification-preferences')
  async updatePreference(
    @CurrentUser() user: { sub: string },
    @Body() body: { type: string; channel: string; isEnabled: boolean },
  ) {
    return this.notificationsService.updatePreference(user.sub, body.type, body.channel, body.isEnabled);
  }

  @Post('device-tokens')
  async registerDeviceToken(
    @CurrentUser() user: { sub: string },
    @Body() body: { token: string; platform: string; appVersion?: string },
  ) {
    return this.notificationsService.registerDeviceToken(user.sub, body.token, body.platform, body.appVersion);
  }

  @Delete('device-tokens/:token')
  async unregisterDeviceToken(
    @Param('token') token: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.notificationsService.unregisterDeviceToken(user.sub, token);
  }
}
