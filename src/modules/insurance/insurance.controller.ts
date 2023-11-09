import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InsuranceService } from '@modules/insurance/insurance.service';
import { ROUTER } from '@configs/route.config';
import {
  CurrentUser,
  TokenPayLoad,
} from '@commons/modules/auth/decorators/user.decorator';
import { BuyInsuranceRequestDTO } from '@modules/insurance/dtos/buy-insurance-request.dto';
import { AuthGuard } from '@commons/modules/auth/guards/jwt-auth.guard';

@Controller(ROUTER.INSURANCE.default)
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post()
  @UseGuards(AuthGuard)
  async buy(
    @CurrentUser() user: TokenPayLoad,
    @Body() payload: BuyInsuranceRequestDTO,
  ) {
    return this.insuranceService.buyInsurance(user, payload);
  }
}
