import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { StoreMembershipService } from './store-membership.service';
import { StoreMembershipController } from './store-membership.controller';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';

@Module({
  controllers: [MerchantController, StoreMembershipController],
  providers: [MerchantService, StoreMembershipService, TenantDatabaseContextInterceptor],
  exports: [MerchantService, StoreMembershipService],
})
export class MerchantModule {}
