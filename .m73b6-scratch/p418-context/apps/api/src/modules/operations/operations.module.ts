import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationsController } from './operations.controller';
import { OpsAlertService } from './ops-alert.service';
import { OpsControlService } from './ops-control.service';
import { P13MonitorService } from './p13-monitor.service';
import { PilotControlService } from './pilot-control.service';
import { WorkerLeaseService } from './worker-lease.service';

/**
 * P13 Phase 4 — Operational readiness module.
 *
 * Depends on DatabaseModule (global) and AuditModule only. It deliberately does
 * NOT import ReturnsModule: the monitor reads P13 tables with raw SQL, which
 * keeps ReturnsModule -> OperationsModule acyclic. The worker lives in
 * ReturnsModule and consumes the services exported here.
 */
@Module({
  imports: [AuditModule],
  controllers: [OperationsController],
  providers: [
    WorkerLeaseService,
    OpsAlertService,
    OpsControlService,
    PilotControlService,
    P13MonitorService,
  ],
  exports: [
    WorkerLeaseService,
    OpsAlertService,
    OpsControlService,
    PilotControlService,
    P13MonitorService,
  ],
})
export class OperationsModule {}
