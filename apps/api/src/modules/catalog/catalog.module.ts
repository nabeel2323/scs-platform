import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogTaxonomyController } from './catalog.taxonomy.controller';
import { CatalogOfferController } from './catalog.offer.controller';
import { CatalogRequestsController } from './catalog.requests.controller';
import { CatalogService } from './catalog.service';
import { CatalogTaxonomyService } from './catalog.taxonomy.service';
import { CatalogOfferService } from './catalog.offer.service';
import { CatalogRequestsService } from './catalog.requests.service';
import { SearchService } from './search.service';
import { ConditionalRulesService } from './conditional-rules.service';
import { AuditModule } from '../audit/index';

@Module({
  imports: [AuditModule],
  controllers: [CatalogController, CatalogTaxonomyController, CatalogOfferController, CatalogRequestsController],
  providers: [CatalogService, CatalogTaxonomyService, CatalogOfferService, CatalogRequestsService, SearchService, ConditionalRulesService],
  exports: [CatalogService, CatalogTaxonomyService, CatalogOfferService, CatalogRequestsService, SearchService, ConditionalRulesService],
})
export class CatalogModule {}
