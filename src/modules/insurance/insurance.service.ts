import {
  BINANCE_QUEUE_ACTION,
  BINANCE_QUEUE_NAME,
} from '@modules/binance/constants';
import { INSURANCE_QUEUE_NAME } from '@modules/insurance/constants';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  INSURANCE_STATE,
  Insurance,
  INSURANCE_SIDE,
} from '@modules/insurance/schemas/insurance.schema';
import { Model } from 'mongoose';
import { LockService } from '@commons/modules/lock/lock.service';
import { EXCEPTION, Exception } from '@commons/constants/exception';
import { User } from '@commons/modules/auth/decorators/user.decorator';
import { PriceV2Service } from '@modules/price/price-v2.service';
import { NOTE_TITLES } from '@modules/insurance/constants';
import { WalletService } from '@modules/wallet/wallet.service';
import { CURRENCIES } from '@commons/constants/currencies';
import {
  HistoryType,
  TRANSACTION_CATEGORY_GROUP,
} from '@commons/constants/transaction-category';
import { WALLET_TYPES } from '@commons/constants';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { NamiSlack } from '@commons/modules/logger/platforms/slack.module';
import { calculatePRefund } from '@modules/insurance/utils';
import Big from 'big.js';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import omit from 'lodash/omit';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import config from '@configs/configuration';
import { SocketService } from '@modules/socket/socket.service';
import { Redis } from 'ioredis';
import { REDIS_PROVIDER } from '@databases/redis/redis.providers';

@Injectable()
export class InsuranceService {
  public readonly insuranceQueue: Queue;
  public readonly binanceQueue: Queue;
  private readonly redisCache: Redis;

  private readonly INSURANCE_ID = 'insurance:id';
  private readonly INSURANCE_LOCK_SIGNATURE = (id: string) =>
    `lock:insurance:${id}`;

  constructor(
    @InjectModel(Insurance.name)
    private readonly insuranceModel: Model<Insurance>,

    private readonly lockService: LockService,
    private readonly priceService: PriceV2Service,
    private readonly walletService: WalletService,
    private readonly esService: ElasticsearchService,
    private readonly socketService: SocketService,

    @InjectQueue(INSURANCE_QUEUE_NAME)
    private readonly _insuranceQueue: Queue,
    @InjectQueue(BINANCE_QUEUE_NAME)
    private readonly _binanceQueue: Queue,

    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly namiSlack: NamiSlack,
    @Inject(REDIS_PROVIDER.CACHE) private readonly redis: Redis,
  ) {
    this.insuranceQueue = this._insuranceQueue;
    this.binanceQueue = this._binanceQueue;
    this.redisCache = this.redis ?? new Redis(config.REDIS.CACHE.URI);
  }

  /**
   * @deprecated use cancelInsurance in insurance-backend instead
   */
  async cancelInsurance(auth: User, _id: string) {
    const { id: userId } = auth;
    const current = new Date();
    return this.lockInsurance(
      _id,
      async () => {
        const insurance = await this.insuranceModel.findOne({
          _id,
          owner: userId,
        });

        if (!insurance) {
          throw new BadRequestException(Exception.NOT_FOUND('insurance')); // INSURANCE_NOT_FOUND
        }

        if (insurance.state !== INSURANCE_STATE.AVAILABLE) {
          throw new BadRequestException(Exception.INVALID('insurance state')); // INVALID_INSURANCE_STATE
        }

        const currentPrice = await this.priceService.price(
          `${insurance.asset_covered}${insurance.unit}`,
          {
            base: insurance.asset_covered,
            quote: insurance.unit,
          },
        )?.lastPrice;

        if (!currentPrice) {
          throw new BadRequestException(
            EXCEPTION.INSURANCE.INVALID_CANCEL_PRICE,
          );
        }

        const p_refund = calculatePRefund(
          insurance.p_market,
          insurance.p_claim,
        );

        // check valid price range
        switch (insurance.side) {
          case INSURANCE_SIDE.BULL: {
            if (
              Big(currentPrice).gte(insurance.p_claim) ||
              Big(currentPrice).lte(
                Big(insurance.p_claim).plus(p_refund).div(2),
              )
            ) {
              throw new BadRequestException(
                EXCEPTION.INSURANCE.INVALID_CANCEL_PRICE,
              );
            }
            break;
          }
          case INSURANCE_SIDE.BEAR: {
            if (
              Big(currentPrice).lte(insurance.p_claim) ||
              Big(currentPrice).gte(
                Big(insurance.p_claim).plus(p_refund).div(2),
              )
            ) {
              throw new BadRequestException(
                EXCEPTION.INSURANCE.INVALID_CANCEL_PRICE,
              );
            }
            break;
          }
        }

        const transactionHistories = [];
        try {
          // unlock margin
          transactionHistories.push(
            await this.walletService.changeBalance({
              userId,
              assetId: CURRENCIES[insurance.unit],
              valueChange: null,
              lockedValueChange: -insurance.margin,
              category: String(
                TRANSACTION_CATEGORY_GROUP[HistoryType.INSURANCE]
                  .INSURANCE_CANCELED,
              ),
              note: `#${_id} ${NOTE_TITLES.EN.REASON.CANCELED} ${NOTE_TITLES.EN.ACTION.UNLOCK}`,
              options: JSON.stringify({
                walletType: WALLET_TYPES.INSURANCE,
                metadata: {
                  insurance,
                },
              }),
            }),
          );

          // await this.insuranceCache.delActiveInsurances([_id]);

          // TODO cancel binance order

          let pnl: number;
          if (insurance?.binance?.position?.origin_quantity) {
            pnl = Number(
              Big(insurance?.binance?.position?.origin_quantity).times(
                Big(currentPrice).minus(insurance.p_market).abs(),
              ),
            );
          }
          insurance.pnl_binance = pnl;
          insurance.pnl_project = pnl;
          insurance.p_close = currentPrice;
          insurance.state = INSURANCE_STATE.CANCELED;
          insurance.changed_time = current.getTime();

          await insurance.save();

          // TODO emit event
          // await this.socketService.noticeChangeState({
          //   ...insurance,
          // });

          // this.esService.createNewCommission(insurance);
          // this.emitUpdateInsuranceEventToNami({
          //   namiUserId: id,
          //   symbol: insurance.asset_covered,
          //   futuresOrderId: insurance?.futures_order_id,
          // });

          return omit(insurance.toObject(), ['binance']);
        } catch (error) {
          this.namiSlack.sendSlackMessage('CANCEL INSURANCE ERROR', {
            userId,
            insurance,
            error,
          });
          this.logger.error('CANCEL INSURANCE ERROR', {
            userId,
            insurance,
            error,
          });
          if (transactionHistories && transactionHistories?.length) {
            this.namiSlack.sendSlackMessage('BUY INSURANCE ROLLBACK WALLET', {
              userId,
              insurance,
              error,
              transactionHistories,
            });
            this.logger.error('BUY INSURANCE ROLLBACK WALLET', {
              userId,
              insurance,
              error: new Error(error),
              transactionHistories,
            });
            this.walletService.rollback({
              transactions: transactionHistories,
            });
          }
          throw error;
        }
      },
      true,
    );
  }

  async cancelBinanceFuturesOrder(insurance: Insurance) {
    return this.binanceQueue.add(BINANCE_QUEUE_ACTION.CANCEL_FUTURES_ORDER, {
      insurance,
    });
  }

  async emitUpdateInsuranceToUser(insurance: Partial<Insurance>) {
    return this.socketService.emitUpdateInsuranceToUser(insurance);
  }

  async emitUpdateInsuranceToNami(payload: {
    namiUserId: string | number;
    symbol: string;
    futuresOrderId: string;
  }) {
    return this.socketService.emitUpdateInsuranceToExchange(payload);
  }

  /**
   * Locks an order with the given ID and executes the provided callback function.
   * @param _id - The ID of the order to lock.
   * @param cb - The callback function to execute after the order is locked.
   * @param needThrow - Whether to throw an error if the order is already locked.
   * @returns A Promise that resolves to the result of the callback function.
   */
  async lockInsurance<T = void>(
    _id: string,
    cb: () => Promise<T>,
    needThrow = false,
  ) {
    return this.lockService.process(
      this.INSURANCE_LOCK_SIGNATURE(_id),
      async () => {
        return cb();
      },
      needThrow
        ? () => {
            throw new ConflictException(EXCEPTION.IS_PROCESSING);
          }
        : null,
    );
  }

  async createInsuranceCommission(insurance: Insurance) {
    try {
      const ES_INDEX_COMMISSION_OFFCHAIN = config.IS_PRODUCTION
        ? `order-insurance-offchain-prod`
        : `order-insurance-offchain-develop`;
      return await this.esService.index({
        index: ES_INDEX_COMMISSION_OFFCHAIN,
        body: {
          insurance_id: insurance._id,
          q_covered: insurance.q_covered,
          asset_covered: insurance.asset_covered,
          margin: insurance.margin,
          p_claim: insurance.p_claim,
          p_market: insurance.p_market,
          p_stop: insurance.p_stop,
          period: insurance.period,
          q_claim: insurance.q_claim,
          quote_asset: CURRENCIES[insurance?.quote_asset],
          expired: insurance.expired,
          createdAt: insurance.createdAt,
          userId: insurance.owner,
          state: insurance.state,
          push_time: Date.now(),
          unit: CURRENCIES[insurance?.unit],
        },
      });
    } catch (error) {
      this.logger.error('CREATE INSURANCE COMMISSION ERROR', {
        insurance,
        error,
      });
      this.namiSlack.sendSlackMessage('CREATE INSURANCE COMMISSION ERROR', {
        insurance,
        error,
      });
    }
  }

  async pushSlack(insurance_id) {
    try {
      this.redisCache.publish(
        config.SLACK.CHANNELS.REDIS_PUBSUB,
        JSON.stringify({ id: insurance_id }),
      );
    } catch (error) {
      console.error('ERROR PUSH SLACK', error);
    }
  }
}
