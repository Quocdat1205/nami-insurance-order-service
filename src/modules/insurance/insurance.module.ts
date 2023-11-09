import { InsuranceController } from '@modules/insurance/insurance.controller';
import { Module } from '@nestjs/common';
import { InsuranceCache } from '@modules/insurance/insurance.cache';
import { InsuranceService } from '@modules/insurance/insurance.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Insurance,
  InsuranceSchema,
} from '@modules/insurance/schemas/insurance.schema';
import {
  AssetConfig,
  AssetConfigSchema,
} from '@modules/insurance/schemas/asset-config.schema';
import {
  InsuranceLog,
  InsuranceLogSchema,
} from '@modules/insurance/schemas/insurance-log.schema';
import {
  PeriodConfig,
  PeriodConfigSchema,
} from '@modules/insurance/schemas/period-config.schema';
import { PriceModule } from '@modules/price/price.modules';
import { WalletModule } from '@modules/wallet/wallet.module';
import { InsuranceQueue } from '@modules/insurance/insurance.queue';
import { BullModule } from '@nestjs/bull';
import { INSURANCE_QUEUE_NAME } from '@modules/insurance/constants';
import { BinanceModule } from '@modules/binance/binance.module';
import { InsuranceJob } from '@modules/insurance/insurance.job';

@Module({
  imports: [
    BullModule.registerQueue({
      name: INSURANCE_QUEUE_NAME,
    }),
    MongooseModule.forFeature([
      { name: Insurance.name, schema: InsuranceSchema },
      { name: AssetConfig.name, schema: AssetConfigSchema },
      { name: InsuranceLog.name, schema: InsuranceLogSchema },
      { name: PeriodConfig.name, schema: PeriodConfigSchema },
    ]),
    BinanceModule,
    PriceModule,
    WalletModule,
  ],
  controllers: [InsuranceController],
  providers: [InsuranceCache, InsuranceService, InsuranceQueue, InsuranceJob],
})
export class InsuranceModule {}
