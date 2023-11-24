import {
  BINANCE_QUEUE_ACTION,
  BINANCE_QUEUE_NAME,
  ORDER_SIDE,
  ORDER_TYPE,
  POSITION_SIDE,
} from '@modules/binance/constants';
import { BinanceService } from '@modules/binance/binance.service';
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { NamiSlack } from '@commons/modules/logger/platforms/slack.module';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import {
  INSURANCE_SIDE,
  Insurance,
} from '@modules/insurance/schemas/insurance.schema';
import { CPU_THREADS } from '@commons/constants';

@Processor(BINANCE_QUEUE_NAME)
export class BinanceQueue {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly namiSlack: NamiSlack,
    private readonly binanceService: BinanceService,
  ) {}

  @Process({
    name: BINANCE_QUEUE_ACTION.CANCEL_FUTURES_ORDER,
    concurrency: CPU_THREADS,
  })
  async cancelFuturesOrder(payload: Job<{ insurance: Insurance }>) {
    const { insurance } = payload?.data;
    const symbol = `${insurance.asset_covered}${insurance.unit}`;

    const binanceAccount = this.binanceService.getBinanceCredential(
      insurance?.binance?.id_binance,
    );

    // cancel TP
    try {
      if (insurance?.binance?.tp?.orderId) {
        const tp = await this.binanceService.cancelFuturesOrder(
          {
            symbol,
            orderId: insurance?.binance.tp.orderId,
          },
          binanceAccount,
        );
        if (tp) {
          const isErrTp = tp.code && tp.code < 0;
          if (isErrTp) {
            throw { message: 'Cancel TP error', insurance, response: tp };
          }
        }
      }
    } catch (error) {
      this.logger.error('ERROR CANCEL TP', error);
      this.namiSlack.sendSlackMessage(`ERROR CANCEL TP ${new Date()}`, error);
    }

    // cancel SL
    try {
      if (insurance?.binance?.sl?.orderId) {
        const sl = await this.binanceService.cancelFuturesOrder(
          {
            symbol,
            orderId: insurance?.binance.sl.orderId,
          },
          binanceAccount,
        );
        if (sl) {
          const isErrSl = sl.code && sl.code < 0;
          if (isErrSl) {
            throw { message: 'Cancel SL error', insurance, response: sl };
          }
        }
      }
    } catch (error) {
      this.logger.error('ERROR CANCEL SL', error);
      this.namiSlack.sendSlackMessage(`ERROR CANCEL SL ${new Date()}`, error);
    }

    // cancel position
    try {
      if (insurance?.binance?.position?.orderId) {
        let position;
        switch (insurance.side) {
          case INSURANCE_SIDE.BULL: {
            position = await this.binanceService.placeFuturesOrder(
              {
                symbol,
                side: ORDER_SIDE.SELL,
                positionSide: POSITION_SIDE.LONG,
                type: ORDER_TYPE.MARKET,
                quantity: insurance?.binance?.position?.origQty,
                newClientOrderId: insurance._id + '_CLOSE',
              },
              binanceAccount,
            );
            break;
          }
          case INSURANCE_SIDE.BEAR: {
            position = await this.binanceService.placeFuturesOrder(
              {
                symbol,
                side: ORDER_SIDE.BUY,
                positionSide: POSITION_SIDE.SHORT,
                type: ORDER_TYPE.MARKET,
                quantity: insurance?.binance?.position?.origQty,
                newClientOrderId: insurance._id + '_CLOSE',
              },
              binanceAccount,
            );
            break;
          }
          default:
            break;
        }
        const isErrPosition = position && position?.code && position?.code < 0;
        if (isErrPosition) {
          throw {
            message: 'Cancel position error',
            insurance,
            response: position,
          };
        }
      }
    } catch (error) {
      this.logger.error('ERROR CANCEL POSITIONS', error);
      this.namiSlack.sendSlackMessage(
        `ERROR CANCEL POSITIONS ${new Date()}`,
        error,
      );
    }
  }
}
