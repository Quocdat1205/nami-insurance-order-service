import { Command, Option } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  INSURANCE_SIDE,
  INSURANCE_STATE,
  Insurance,
} from '@modules/insurance/schemas/insurance.schema';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import {
  INSURANCE_ACTION,
  INSURANCE_QUEUE_ACTION,
  INSURANCE_QUEUE_NAME,
} from '@modules/insurance/constants';
import { InsuranceService } from '@modules/insurance/insurance.service';

@Injectable()
export class CommandInsuranceService {
  public readonly insuranceQueue: Queue;

  constructor(
    @InjectModel(Insurance.name)
    private readonly insuranceModel: Model<Insurance>,
    @InjectQueue(INSURANCE_QUEUE_NAME)
    private readonly _insuranceQueue: Queue,
    private readonly insuranceService: InsuranceService,
  ) {
    this.insuranceQueue = this._insuranceQueue;
  }

  @Command({
    command: 'handle-error-order',
    describe: 'Handle error order',
  })
  async handleErrorOrder(
    @Option({
      name: 'insurance_id',
      describe: 'insurance id',
      type: 'string',
    })
    insurance_id: string = '',

    @Option({
      name: 'state',
      describe: "state'll change",
      type: 'string',
    })
    state: string = '',
  ): Promise<void> {
    // example npx nestjs-command change-state --insurance_id 1111 --state Available
    console.log('INSURANCE CHANGE STATE', insurance_id, state);

    try {
      if (insurance_id && state) {
        const _insurance = await this.insuranceModel.findOne({
          _id: insurance_id,
        });
        if (
          _insurance.state !== INSURANCE_STATE.AVAILABLE ||
          state === INSURANCE_STATE.AVAILABLE
        ) {
          console.log('CHANGE STATE INSURANCE ERROR', _insurance);
          return;
        }

        switch (state) {
          case INSURANCE_STATE.LIQUIDATED:
            await this.insuranceService.insuranceQueue.add(
              INSURANCE_QUEUE_ACTION.HIT_SLTP,
              {
                insurance: _insurance,
                currentTime: Date.now(),
                type: INSURANCE_ACTION.SL,
              },
            );
            break;
          case INSURANCE_STATE.CLAIMED:
            await this.insuranceService.insuranceQueue.add(
              INSURANCE_QUEUE_ACTION.HIT_SLTP,
              {
                insurance: _insurance,
                currentTime: Date.now(),
                type: INSURANCE_ACTION.TP,
              },
            );
            break;
        }
      }
    } catch (err: any) {
      throw new Error(err.message);
    }

    return;
  }

  @Command({
    command: 'insurance:recalculate-expired-pnl',
    describe: 'Recalculate expired insurance PnL',
  })
  async recalculateExpiredInsurancePnL(): Promise<void> {
    const insurances = await this.insuranceModel.find({
      state: INSURANCE_STATE.LIQUIDATED,
      is_transfer_binance: 1,
      type_state: INSURANCE_STATE.EXPIRED,
      p_close: {
        $gt: 0,
      },
    });
    for (const insurance of insurances) {
      const { p_close, p_market, pnl } = insurance;
      let pnl_binance = 0;
      if (insurance?.binance?.position?.origQty) {
        const quantity = Number(insurance?.binance?.position?.origQty);
        if (
          (insurance.side === INSURANCE_SIDE.BEAR && p_close < p_market) ||
          (insurance.side === INSURANCE_SIDE.BULL && p_close > p_market)
        ) {
          // Lãi
          pnl_binance = quantity * Math.abs(p_market - p_close);
        } else {
          // Lỗ
          pnl_binance = -quantity * Math.abs(p_market - p_close);
        }
      } else {
        continue;
      }
      const pnl_project = pnl_binance - pnl;
      await this.insuranceModel.updateOne(
        { _id: insurance._id },
        {
          pnl_project,
          pnl_binance,
        },
      );
      console.log("pnl_binance", pnl_binance)
      console.log('UPDATED PNL INSURANCE', insurance._id);
    }
    console.log('DONE');
  }
}
