import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { StoreMembershipService } from './store-membership.service';
import { StoreMembershipController } from './store-membership.controller';

@Module({
  controllers: [MerchantController, StoreMembershipController],
  providers: [MerchantService, StoreMembershipService],
  exports: [MerchantService, StoreMembershipService],
})
export class MerchantModule {}
