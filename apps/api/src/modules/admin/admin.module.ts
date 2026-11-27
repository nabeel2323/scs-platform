import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import { NotificationsModule } from '../notifications/notifications.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [NotificationsModule, CatalogModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, TenantDatabaseContextInterceptor],
  exports: [AdminService],
})
export class AdminModule {}
