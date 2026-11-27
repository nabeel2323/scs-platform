import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Reclaims abandoned payment-proof objects from durable upload intents.
 *
 * Deliberately disabled unless PAYMENT_PROOF_CLEANUP_WORKER_ENABLED=true.
 * Registering this provider never activates it by itself.
 */
@Injectable()
export class PaymentProofCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentProofCleanupWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly payments: PaymentsService) {}

  onModuleInit(): void {
    if (process.env['PAYMENT_PROOF_CLEANUP_WORKER_ENABLED'] !== 'true') {
      this.logger.log('Payment proof cleanup worker is registered but disabled.');
      return;
    }

    const configuredInterval = Number(process.env['PAYMENT_PROOF_CLEANUP_INTERVAL_MS']);
    const intervalMs = Number.isFinite(configuredInterval) && configuredInterval > 0
      ? Math.max(30_000, Math.min(3_600_000, Math.floor(configuredInterval)))
      : 300_000;

    this.timer = setInterval(() => {
      void this.poll();
    }, intervalMs);
    this.logger.warn(`Payment proof cleanup worker enabled; polling every ${intervalMs}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.payments.cleanupStaleProofUploads();
      if (result.claimed > 0) {
        this.logger.log(
          `Payment proof cleanup: claimed=${result.claimed}, cleaned=${result.cleaned}, committed=${result.committed}, retried=${result.retried}, failed=${result.failed}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Payment proof cleanup cycle failed: ${error?.message || 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
