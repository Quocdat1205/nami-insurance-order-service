import Bluebird from 'bluebird';
import { InsuranceService } from '@modules/insurance/insurance.service';
import { Injectable } from '@nestjs/common';
import { InsuranceCache } from '@modules/insurance/insurance.cache';
import { PriceService } from '@modules/price/price.service';
import { HighLowIntervalPrice, HighLowPrice } from '@modules/price/types';
import { CPU_THREADS, SECONDS_TO_MILLISECONDS } from '@commons/constants';
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
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class InsuranceJob {
  constructor(
    @InjectModel(Insurance.name)
    private readonly insuranceModel: Model<Insurance>,

    private readonly insuranceService: InsuranceService,
    private readonly insuranceCache: InsuranceCache,
    private readonly priceService: PriceService,
  ) {
    this.priceService.subscribeHighLowInterval(
      'insurance',
      SECONDS_TO_MILLISECONDS.FIVE,
      (data: HighLowIntervalPrice) => this.handleInsurances(data),
    );
  }

  private async handleInsurances(priceData: HighLowIntervalPrice) {
    const insurances = await this.insuranceCache.getActiveInsurances();
    await Bluebird.map(
      insurances,
      async (insurance) => {
        const currentTime = new Date();
        const symbol = `${insurance.asset_covered}${insurance.unit}`;
        const prices = this.priceService.highLowPrice(
          symbol,
          {
            base: insurance.asset_covered,
            quote: insurance.unit,
          },
          priceData,
        );
        if (!prices) {
          console.warn('NO PRICE FOUND: ', symbol, insurance._id, new Date());
          return;
        }
        switch (insurance.side) {
          case INSURANCE_SIDE.BULL: {
            return await this.handleBull(insurance, prices, currentTime);
          }
          case INSURANCE_SIDE.BEAR: {
            return await this.handleBear(insurance, prices, currentTime);
          }
        }
      },
      {
        concurrency: CPU_THREADS,
      },
    );
  }

  private async handleBull(
    insurance: Insurance,
    prices: HighLowPrice,
    currentTime: Date,
  ) {
    const currentPrice = prices.askHigh;

    insurance.p_close = currentPrice;

    // hit TP
    if (Big(currentPrice).gte(insurance.p_claim)) {
      await this.insuranceCache.delActiveInsurances([insurance._id]);
      this.insuranceService.insuranceQueue.add(
        INSURANCE_QUEUE_ACTION.HIT_SLTP,
        {
          insurance: insurance,
          currentTime,
          type: INSURANCE_ACTION.TP,
        },
      );
    }

    // hit SL
    if (Big(currentPrice).lte(insurance.p_stop)) {
      await this.insuranceCache.delActiveInsurances([insurance._id]);
      this.insuranceService.insuranceQueue.add(
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
    prices: HighLowPrice,
    currentTime: Date,
  ) {
    const currentPrice = prices.bidLow;

    insurance.p_close = currentPrice;

    // hit TP
    if (Big(currentPrice).lte(insurance.p_claim)) {
      await this.insuranceCache.delActiveInsurances([insurance._id]);
      this.insuranceService.insuranceQueue.add(
        INSURANCE_QUEUE_ACTION.HIT_SLTP,
        {
          insurance: insurance,
          currentTime,
          type: INSURANCE_ACTION.TP,
        },
      );
    }

    // hit SL
    if (Big(currentPrice).gte(insurance.p_stop)) {
      await this.insuranceCache.delActiveInsurances([insurance._id]);
      this.insuranceService.insuranceQueue.add(
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
   * @note
   * each insurance is inserted individually
   * running sltp job can still be processed without fully sync needed
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
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
