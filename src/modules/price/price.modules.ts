import { PriceController } from '@modules/price/price.controller';
import { Module } from '@nestjs/common';
// import { PriceService } from '@modules/price/price.service';
import { PriceV2Service } from './price-v2.service';

@Module({
  controllers: [PriceController],
  providers: [PriceV2Service],
  exports: [PriceV2Service],
})
export class PriceModule {}
