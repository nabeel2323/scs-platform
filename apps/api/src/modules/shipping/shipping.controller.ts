import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermission } from '../../common/guards/current-user.decorator';
import { ShippingService } from './shipping.service';

/**
 * ShippingController — M7.2.1 minimal endpoint.
 *
 * Exposes a single GET /v1/shipping/providers endpoint that lists
 * registered shipping providers.  This validates that the module
 * loads correctly and the provider registry works at runtime.
 *
 * Later phases will add:
 * - Shipping method CRUD endpoints (M7.2.2)
 * - Delivery zone endpoints (M7.2.3)
 * - Driver eligibility endpoints (M7.2.5)
 * - Carrier webhook receiver (M7.2.7)
 */
@Controller('v1/shipping')
@UseGuards(JwtAuthGuard)
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  /**
   * GET /v1/shipping/providers
   *
   * List all registered shipping provider keys.
   * Requires authentication.  Uses fulfillment:shipments:read as the
   * closest existing permission; M7.2.2 will add merchant:shipping:read.
   */
  @Get('providers')
  @RequirePermission('fulfillment:shipments:read')
  async listProviders() {
    const keys = this.shippingService.listProviders();
    const defaultProvider = this.shippingService.getDefaultProvider();
    return {
      providers: keys.map((key) => {
        const provider = this.shippingService.getProvider(key);
        return {
          key: provider.key,
          name: provider.name,
          type: provider.type,
          capabilities: provider.capabilities,
          isDefault: key === defaultProvider.key,
        };
      }),
    };
  }
}
