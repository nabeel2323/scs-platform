import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogTaxonomyController } from './catalog.taxonomy.controller';
import { CatalogOfferController } from './catalog.offer.controller';
import { CatalogService } from './catalog.service';
import { CatalogTaxonomyService } from './catalog.taxonomy.service';
import { CatalogOfferService } from './catalog.offer.service';
import { SearchService } from './search.service';
import { AuditModule } from '../audit/index';

@Module({
  imports: [AuditModule],
  controllers: [CatalogController, CatalogTaxonomyController, CatalogOfferController],
  providers: [CatalogService, CatalogTaxonomyService, CatalogOfferService, SearchService],
  exports: [CatalogService, CatalogTaxonomyService, CatalogOfferService, SearchService],
})
export class CatalogModule {}
