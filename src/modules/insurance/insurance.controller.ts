import { Controller } from '@nestjs/common';
import { InsuranceService } from '@modules/insurance/insurance.service';
import { ROUTER } from '@configs/route.config';

@Controller(ROUTER.INSURANCE.default)
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}
}
