import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { ReturnExpirationWorker } from './return-expiration.worker';
import { BusinessCalendarService } from './business-calendar.service';
import { CommissionReversalService } from './commission-reversal.service';
import { SettlementAdjustmentService } from './settlement-adjustment.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  // OperationsModule provides the lease, pause control, alerting and pilot gate
  // the worker and returns flow depend on. It imports AuditModule only, so this
  // edge introduces no cycle.
  imports: [OperationsModule],
  controllers: [ReturnsController],
  providers: [
    ReturnsService,
    ReturnExpirationWorker,
    BusinessCalendarService,
    CommissionReversalService,
    SettlementAdjustmentService,
    ReconciliationService,
  ],
  exports: [
    ReturnsService,
    BusinessCalendarService,
    CommissionReversalService,
    SettlementAdjustmentService,
    ReconciliationService,
  ],
})
export class ReturnsModule {}
