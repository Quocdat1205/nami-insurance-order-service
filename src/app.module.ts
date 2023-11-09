import { Module } from '@nestjs/common';
import { RootModules } from '@configs/root.config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { InsuranceModule } from '@modules/insurance/insurance.module';
import { BinanceModule } from '@modules/binance/binance.module';

const FeatureModules = [BinanceModule, InsuranceModule];

@Module({
  imports: [...RootModules, ...FeatureModules],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
