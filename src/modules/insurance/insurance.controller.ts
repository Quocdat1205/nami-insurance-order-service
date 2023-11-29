import { Controller, Get, Query } from '@nestjs/common';
import { InsuranceService } from '@modules/insurance/insurance.service';
import { ROUTER } from '@configs/route.config';

@Controller(ROUTER.INSURANCE.default)
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Get('publish')
  async publishToChannel(@Query() query: any) {
    const id = query?.id;
    console.log('publishToChannel', query, id);
    if (id) {
      const publish = await this.insuranceService.pushSlack(id);
    }
  }
}
