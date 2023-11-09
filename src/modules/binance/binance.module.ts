import { BinanceQueue } from '@modules/binance/binance.queue';
import { BinanceService } from '@modules/binance/binance.service';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BINANCE_QUEUE_NAME } from '@modules/binance/constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BINANCE_QUEUE_NAME,
    }),
  ],
  providers: [BinanceService, BinanceQueue],
  exports: [BinanceService, BullModule],
})
export class BinanceModule {}
