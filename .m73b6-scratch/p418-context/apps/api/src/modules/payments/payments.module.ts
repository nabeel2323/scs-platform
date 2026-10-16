/**
 * P12 Payments Module
 *
 * Registers the payment domain: provider registry, manual verification
 * provider, payments service, and controller.
 *
 * Dependencies:
 * - DatabaseService (global)
 * - OutboxDispatcher (global via OutboxModule)
 * - StorageService (global via StorageModule)
 */

import { Module, Global } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentProviderRegistry } from './payments.provider-registry';
import { ManualVerificationProvider } from './manual-verification.provider';

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderRegistry,
    ManualVerificationProvider,
    {
      provide: 'PAYMENT_PROVIDER_INIT',
      useFactory: (registry: PaymentProviderRegistry, manual: ManualVerificationProvider) => {
        registry.register(manual);
        return registry;
      },
      inject: [PaymentProviderRegistry, ManualVerificationProvider],
    },
  ],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}
