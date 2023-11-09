import { CPU_THREADS, WALLET_TYPES } from '@commons/constants';
import {
  DEFAULT_DECIMAL,
  INSURANCE_ACTION,
  INSURANCE_QUEUE_ACTION,
  INSURANCE_QUEUE_NAME,
  NOTE_TITLES,
} from '@modules/insurance/constants';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { NamiSlack } from '@commons/modules/logger/platforms/slack.module';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';
import {
  INSURANCE_SIDE,
  INSURANCE_STATE,
  Insurance,
} from '@modules/insurance/schemas/insurance.schema';
import { BinanceService } from '@modules/binance/binance.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Big from 'big.js';
import { InsuranceService } from '@modules/insurance/insurance.service';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { WalletService } from '@modules/wallet/wallet.service';
import { CURRENCIES } from '@commons/constants/currencies';
import {
  HistoryType,
  TRANSACTION_CATEGORY_GROUP,
} from '@commons/constants/transaction-category';
import config from '@configs/configuration';

@Processor(INSURANCE_QUEUE_NAME)
export class InsuranceQueue {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly namiSlack: NamiSlack,

    @InjectModel(Insurance.name)
    private readonly insuranceModel: Model<Insurance>,

    private readonly binanceService: BinanceService,
    private readonly insuranceService: InsuranceService,
    private readonly walletService: WalletService,
  ) {}

  @Process({
    name: INSURANCE_QUEUE_ACTION.HIT_SLTP,
    concurrency: CPU_THREADS,
  })
  async handleHitSltp(
    payload: Job<{
      insurance: Insurance;
      currentTime: string | Date;
      type: keyof typeof INSURANCE_ACTION;
    }>,
  ) {
    payload.data.currentTime = new Date(payload.data.currentTime);
    const { insurance: _insurance, currentTime, type } = payload?.data;

    const insurance = new this.insuranceModel(_insurance);
    insurance.isNew = false;

    let pnlBinance = 0;
    let pnlProject = 0;

    try {
      this.insuranceService.cancelBinanceFuturesOrder(insurance);
      let orderLog;
      switch (type) {
        case INSURANCE_ACTION.TP: {
          if (insurance?.binance?.position?.origQty) {
            (pnlBinance = Number(
              Big(insurance?.binance?.position?.origQty)
                .times(Big(insurance.p_market).minus(insurance.p_close).abs())
                .toFixed(DEFAULT_DECIMAL),
            )),
              (pnlProject = Number(
                Big(pnlBinance)
                  .minus(insurance.q_claim)
                  .plus(insurance.margin)
                  .toFixed(DEFAULT_DECIMAL),
              ));
          } else {
            // pnlProject = insurance.margin - insurance.q_claim;
            pnlProject = Number(
              Big(insurance.margin)
                .minus(insurance.q_claim)
                .toFixed(DEFAULT_DECIMAL),
            );
          }

          insurance.state = INSURANCE_STATE.CLAIMED;
          insurance.pnl = insurance.q_claim - insurance.margin;
          insurance.pnl_binance = pnlBinance;
          insurance.pnl_project = pnlProject || 0;
          insurance.changed_time = currentTime.getTime();
          insurance.payback = false;

          orderLog = {
            insuranceId: insurance._id,
            message: 'Hit TP',
            metadata: [
              {
                field: 'state',
                from: _insurance.state ?? null,
                to: insurance.state,
              },
            ],
          };
          break;
        }

        case INSURANCE_ACTION.SL: {
          if (insurance?.binance?.position?.origQty) {
            pnlBinance = Number(
              Big(insurance?.binance?.position?.origQty)
                .times(Big(insurance.p_market).minus(insurance.p_close).abs())
                .toFixed(DEFAULT_DECIMAL),
            );
            pnlProject = Number(
              Big(pnlBinance).minus(insurance.margin).toFixed(DEFAULT_DECIMAL),
            );
          } else {
            pnlProject = insurance.margin;
          }

          insurance.state = INSURANCE_STATE.LIQUIDATED;
          insurance.type_state = INSURANCE_STATE.LIQUIDATED;
          insurance.pnl = -insurance.margin;
          insurance.changed_time = currentTime.getTime();
          insurance.pnl_binance = pnlProject || 0;
          insurance.pnl_project = pnlBinance;
          insurance.payback = false;

          orderLog = {
            insuranceId: insurance._id,
            message: 'Hit SL',
            metadata: [
              {
                field: 'state',
                from: insurance.state ?? null,
                to: insurance.state,
              },
              {
                field: 'type_state',
                from: insurance.type_state ?? null,
                to: insurance.type_state,
              },
            ],
          };

          break;
        }

        default: {
          break;
        }
      }

      const transactionHistories = [];
      try {
        const changeBalancePayload = {
          [INSURANCE_ACTION.TP]: {
            category: String(
              TRANSACTION_CATEGORY_GROUP[HistoryType.INSURANCE]
                .INSURANCE_CLAIMED,
            ),
            changeAmount: insurance.pnl,
            unlockNote: `#${insurance._id} ${NOTE_TITLES.EN.REASON.CLAIM} ${NOTE_TITLES.EN.ACTION.UNLOCK}`,
            note: `#${insurance._id} ${NOTE_TITLES.EN.REASON.CLAIM} ${NOTE_TITLES.EN.ACTION.INCREMENT}`,
          },
          [INSURANCE_ACTION.SL]: {
            category: String(
              TRANSACTION_CATEGORY_GROUP[HistoryType.INSURANCE]
                .INSURANCE_LIQUIDATED,
            ),
            changeAmount: -insurance.margin,
            unlockNote: `#${insurance._id} ${NOTE_TITLES.EN.REASON.LIQUIDATED} ${NOTE_TITLES.EN.ACTION.UNLOCK}`,
            note: `#${insurance._id} ${NOTE_TITLES.EN.REASON.LIQUIDATED} ${NOTE_TITLES.EN.ACTION.DECREMENT}`,
          },
        }[type];

        // unlock margin
        transactionHistories.push(
          await this.walletService.changeBalance({
            userId: insurance.owner,
            assetId: CURRENCIES[insurance.unit],
            valueChange: null,
            lockedValueChange: -insurance.margin,
            category: changeBalancePayload.category,
            note: changeBalancePayload.unlockNote,
            options: JSON.stringify({
              walletType: WALLET_TYPES.INSURANCE,
              metadata: {
                insurance,
              },
            }),
          }),
        );

        // tru pool
        transactionHistories.push(
          await this.walletService.changeBalance({
            userId: config.INSURANCE_POOL_USER_ID,
            assetId: CURRENCIES[insurance.unit],
            valueChange: -changeBalancePayload.changeAmount,
            lockedValueChange: null,
            category: changeBalancePayload.category,
            note: `INSURANCE POOL: ${insurance._id}`,
            options: JSON.stringify({
              walletType: WALLET_TYPES.INSURANCE,
              metadata: {
                insurance,
              },
            }),
          }),
        );

        // thay doi balance
        transactionHistories.push(
          await this.walletService.changeBalance({
            userId: insurance.owner,
            assetId: CURRENCIES[insurance.unit],
            valueChange: changeBalancePayload.changeAmount,
            lockedValueChange: null,
            category: changeBalancePayload.category,
            note: changeBalancePayload.note,
            options: JSON.stringify({
              walletType: WALLET_TYPES.INSURANCE,
              metadata: {
                insurance,
              },
            }),
          }),
        );

        insurance.payback = true;

        orderLog.metadata.push({
          field: 'payback',
          from: _insurance.payback ?? null,
          to: true,
        });
      } catch (error) {
        this.namiSlack.sendSlackMessage(
          'HIT TP INSURANCE TRANSFER WALLET ERROR',
          {
            userId: insurance.owner,
            payload,
            error,
            transactionHistories,
          },
        );
        this.logger.error('HIT TP INSURANCE TRANSFER WALLET ERROR', {
          userId: insurance.owner,
          payload,
          error: new Error(error),
          transactionHistories,
        });
        if (transactionHistories && transactionHistories?.length) {
          this.walletService.rollback({
            transactions: transactionHistories,
          });
        }
      }

      await this.insuranceModel.updateOne({ _id: insurance._id }, insurance);

      // TODO
      // this.esService.createNewCommission(insurance);
      // this.eventEmitter.emit(NAMI_EVENTS.UPDATE_INSURANCE_TO_NAMI, {
      //   namiUserId: insurance.owner,
      //   symbol: insurance.asset_covered,
      //   futuresOrderId: insurance.futures_order_id,
      // });
      // this.helperRestService.pushNoticeChangeState(insurance);
      // this.socketService.noticeChangeState(insurance);
    } catch (error) {
      this.namiSlack.sendSlackMessage('HIT TP INSURANCE ERROR', {
        userId: insurance.owner,
        payload,
        error,
      });
      this.logger.error('HIT TP INSURANCE ERROR', {
        userId: insurance.owner,
        payload,
        error,
      });
      console.error('ERROR TP JOB', error);
    }
  }
}