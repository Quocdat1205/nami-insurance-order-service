import Bluebird from 'bluebird';
import { InsuranceService } from '@modules/insurance/insurance.service';
import { Injectable, Logger } from '@nestjs/common';
import { InsuranceCache } from '@modules/insurance/insurance.cache';
// import { PriceService } from '@modules/price/price.service';
import { SymbolTicker } from '@modules/price/types';
import { CPU_THREADS } from '@commons/constants';
import {
  INSURANCE_SIDE,
  INSURANCE_STATE,
  Insurance,
} from '@modules/insurance/schemas/insurance.schema';
import Big from 'big.js';
import {
  INSURANCE_ACTION,
  INSURANCE_QUEUE_ACTION,
} from '@modules/insurance/constants';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CheckPrice } from './types';
import { OnEvent } from '@nestjs/event-emitter';
import { PRICE_EVENTS } from '@modules/price/constants/events';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class InsuranceJob {
  private readonly logger = new Logger(InsuranceJob.name);
  private readonly checkPrices = new Map<string, CheckPrice[]>();

  constructor(
    @InjectModel(Insurance.name)
    private readonly insuranceModel: Model<Insurance>,

    private readonly insuranceService: InsuranceService,
    private readonly insuranceCache: InsuranceCache, 
    // private readonly priceService: PriceService,
  ) {
    // this.priceService.subscribeHighLowInterval(
    //   'insurance',
    //   SECONDS_TO_MILLISECONDS.TEN,
    //   (data: HighLowIntervalPrice) => this.handleInsurances(data),
    // );
  }

  @OnEvent(PRICE_EVENTS.SYMBOL_TICKER)
  handleSymbolTickerEvent(ticker: SymbolTicker) {
    if (!this.checkPrices.has(ticker.symbol)) {
      this.checkPrices.set(ticker.symbol, []);
    }

    this.checkPrices.get(ticker.symbol).push({
      p: ticker.lastPrice,
      t: Date.now(),
    });
  }

  @Cron('*/10 * * * * *') // every 10 seconds
  async handleCheckInsurances() {
    const insurances = await this.insuranceModel
      .find({
        state: INSURANCE_STATE.AVAILABLE,
      })
      .read('primary')
      .lean();

    const symbols = insurances.map(
      (insurance) => `${insurance.asset_covered}${insurance.unit}`,
    );
    const prices = new Map<string, CheckPrice[]>();
    for (const symbol of symbols) {
      const checkPrice = this.checkPrices.get(symbol) || [];
      prices.set(symbol, checkPrice);
    }
    this.checkPrices.clear();

    await Bluebird.map(
      insurances,
      async (insurance) => {
        const currentTime = new Date();
        const symbol = `${insurance.asset_covered}${insurance.unit}`;
        const startTime = insurance.createdAt || 0;
        const endTime = insurance.expired || currentTime.getTime();
        const listPrices = prices.get(symbol).reduce((list, p) => {
          if (p.t >= startTime && p.t <= endTime) {
            list.push(p.p);
          }
          return list;
        }, []);
        if (!listPrices || listPrices.length === 0) {
          return;
        }

        const high = Math.min(...listPrices);
        const low = Math.max(...listPrices);

        try {
          switch (insurance.side) {
            case INSURANCE_SIDE.BULL: {
              return await this.handleBull(insurance, high, low, currentTime);
            }
            case INSURANCE_SIDE.BEAR: {
              return await this.handleBear(insurance, high, low, currentTime);
            }
          }
        } catch (error) {
          this.logger.error(
            'Add to claim queue error: ',
            error.message,
            insurance._id,
          );
        }
      },
      {
        concurrency: CPU_THREADS,
      },
    );
  }

  // private async handleInsurances(priceData: HighLowIntervalPrice) {
  //   // const insurances = await this.insuranceCache.getActiveInsurances();
  //   const insurances = await this.insuranceModel
  //     .find({
  //       state: INSURANCE_STATE.AVAILABLE,
  //     })
  //     .read('primary')
  //     .lean();
  //   await Bluebird.map(
  //     insurances,
  //     async (insurance) => {
  //       const currentTime = new Date();
  //       const symbol = `${insurance.asset_covered}${insurance.unit}`;
  //       const prices = this.priceService.highLowPrice(
  //         symbol,
  //         {
  //           base: insurance.asset_covered,
  //           quote: insurance.unit,
  //         },
  //         priceData,
  //       );
  //       if (!prices) {
  //         console.warn('NO PRICE FOUND: ', symbol, insurance._id, new Date());
  //         return;
  //       }
  //       switch (insurance.side) {
  //         case INSURANCE_SIDE.BULL: {
  //           return await this.handleBull(insurance, prices, currentTime);
  //         }
  //         case INSURANCE_SIDE.BEAR: {
  //           return await this.handleBear(insurance, prices, currentTime);
  //         }
  //       }
  //     },
  //     {
  //       concurrency: CPU_THREADS,
  //     },
  //   );
  // }

  private async handleBull(
    insurance: Insurance,
    high: number,
    low: number,
    currentTime: Date,
  ) {
    // hit TP
    if (Big(high).gte(insurance.p_claim)) {
      insurance.p_close = high;
      // await this.insuranceCache.delActiveInsurances([insurance._id]);
      await this.insuranceService.insuranceQueue.add(
        INSURANCE_QUEUE_ACTION.HIT_SLTP,
        {
          insurance: insurance,
          currentTime,
          type: INSURANCE_ACTION.TP,
        },
      );
    }

    // hit SL
    if (Big(low).lte(insurance.p_stop)) {
      insurance.p_close = low;
      // await this.insuranceCache.delActiveInsurances([insurance._id]);
      await this.insuranceService.insuranceQueue.add(
        INSURANCE_QUEUE_ACTION.HIT_SLTP,
        {
          insurance: insurance,
          currentTime,
          type: INSURANCE_ACTION.SL,
        },
      );
    }
  }

  private async handleBear(
    insurance: Insurance,
    high: number,
    low: number,
    currentTime: Date,
  ) {
    // hit TP
    if (Big(low).lte(insurance.p_claim)) {
      insurance.p_close = low;

      // await this.insuranceCache.delActiveInsurances([insurance._id]);
      await this.insuranceService.insuranceQueue.add(
        INSURANCE_QUEUE_ACTION.HIT_SLTP,
        {
          insurance: insurance,
          currentTime,
          type: INSURANCE_ACTION.TP,
        },
      );
    }

    // hit SL
    if (Big(high).gte(insurance.p_stop)) {
      insurance.p_close = high;
      // await this.insuranceCache.delActiveInsurances([insurance._id]);
      await this.insuranceService.insuranceQueue.add(
        INSURANCE_QUEUE_ACTION.HIT_SLTP,
        {
          insurance: insurance,
          currentTime,
          type: INSURANCE_ACTION.SL,
        },
      );
    }
  }

  /**
   * @deprecated no need to use redis cache
   * @note
   * each insurance is inserted individually
   * running sltp job can still be processed without fully sync needed
   */
  // @Cron(CronExpression.EVERY_5_MINUTES)
  async syncInsuranceToRedis() {
    console.log('syncInsuranceToRedis', new Date());
    const insurances = await this.insuranceModel
      .find({
        state: INSURANCE_STATE.AVAILABLE,
      })
      .read('primary')
      .lean();
    await this.insuranceCache.clearActiveInsurances();
    return await Promise.all(
      insurances.map(async (insurance) => {
        return await this.insuranceCache.setOneActiveInsurance(insurance);
      }),
    );
  }
}
