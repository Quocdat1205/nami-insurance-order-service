import { Command, Option } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
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
}
