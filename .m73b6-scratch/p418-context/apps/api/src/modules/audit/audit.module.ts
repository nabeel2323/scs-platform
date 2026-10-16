import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogMiddleware } from './audit-log.middleware';

@Module({
  providers: [AuditService, AuditLogMiddleware],
  exports: [AuditService],
})
export class AuditModule {}
