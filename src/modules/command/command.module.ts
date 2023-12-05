import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
// eslint-disable-next-line no-restricted-imports
import { CommandInsuranceService } from './command.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Insurance,
  InsuranceSchema,
} from '@modules/insurance/schemas/insurance.schema';
import { PriceModule } from '@modules/price/price.modules';
import { BullModule } from '@nestjs/bull';
import { INSURANCE_QUEUE_NAME } from '@modules/insurance/constants';
import { InsuranceModule } from '@modules/insurance/insurance.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: INSURANCE_QUEUE_NAME,
    }),
    CommandModule,
    MongooseModule.forFeature([
      { name: Insurance.name, schema: InsuranceSchema },
    ]),
    PriceModule,
    InsuranceModule,
  ],
  providers: [CommandInsuranceService],
  exports: [CommandInsuranceService],
})
export class CommandInsuranceModule {}
