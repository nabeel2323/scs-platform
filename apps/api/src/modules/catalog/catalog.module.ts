import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { SearchService } from './search.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, SearchService],
  exports: [CatalogService, SearchService],
})
export class CatalogModule {}
