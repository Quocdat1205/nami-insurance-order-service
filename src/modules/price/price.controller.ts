import { Controller, Get, Param, Query } from '@nestjs/common';
import { ROUTER } from '@configs/route.config';
import { PriceV2Service } from './price-v2.service';

@Controller(ROUTER.PRICE.default)
export class PriceController {
  constructor(private readonly priceService: PriceV2Service) {}

  @Get(':pair')
  async price(
    @Param('pair') pair: string,
    @Query() query: { base: string; quote: string },
  ) {
    if (pair.toUpperCase() === 'ALL') return this.priceService.bookTickers;
    return this.priceService.price(pair, query);
  }
}
