import { OnchainHistory } from '@modules/insurance/schemas/onchain-history.schema';
import {
  BINANCE_QUEUE_ACTION,
  BINANCE_QUEUE_NAME,
  ORDER_SIDE,
  ORDER_TYPE,
  POSITION_SIDE,
} from '@modules/binance/constants';
import {
  INSURANCE_QUEUE_NAME,
  TRANSFER_HISTORY,
} from '@modules/insurance/constants';
import { InsuranceCache } from '@modules/insurance/insurance.cache';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  INSURANCE_STATE,
  INSURANCE_TYPE,
  PERIOD_TYPE,
  Insurance,
  INSURANCE_SIDE,
} from '@modules/insurance/schemas/insurance.schema';
import { CacheService } from '@commons/modules/cache/cache.service';
import { Model } from 'mongoose';
import { LockService } from '@commons/modules/lock/lock.service';
import { EXCEPTION, Exception } from '@commons/constants/exception';
import { BuyInsuranceRequestDTO } from '@modules/insurance/dtos/buy-insurance-request.dto';
import { TokenPayLoad } from '@commons/modules/auth/decorators/user.decorator';
import { PriceService } from '@modules/price/price.service';
import {
  BINANCE_ORDER_MARGIN,
  CLAIM_MIN_RATIO,
  DEFAULT_DECIMAL,
  DEFAULT_TOKEN_UNIT,
  FILTER_TYPE,
  NOTE_TITLES,
  generateFuturesInsuranceKey,
} from '@modules/insurance/constants';
import { WalletService } from '@modules/wallet/wallet.service';
import { CURRENCIES } from '@commons/constants/currencies';
import {
  HistoryType,
  TRANSACTION_CATEGORY_GROUP,
} from '@commons/constants/transaction-category';
import { MINUTES_TO_MILLISECONDS, WALLET_TYPES } from '@commons/constants';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { NamiSlack } from '@commons/modules/logger/platforms/slack.module';
import {
  calculateFuturesBnbQuantity,
  calculateInsuranceStat,
  calculatePRefund,
  symbolFilter,
  validateMargin,
} from '@modules/insurance/utils';
import Big from 'big.js';
import { AssetConfig } from '@modules/insurance/schemas/asset-config.schema';
import { PeriodConfig } from '@modules/insurance/schemas/period-config.schema';
import { InsuranceLog } from '@modules/insurance/schemas/insurance-log.schema';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  BinanceService,
  IBinanceCredential,
} from '@modules/binance/binance.service';
import { isSuccessResponse } from '@modules/binance/utils';
import omit from 'lodash/omit';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import config from '@configs/configuration';
import { SocketService } from '@modules/socket/socket.service';

@Injectable()
export class InsuranceService {
  public readonly insuranceQueue: Queue;
  public readonly binanceQueue: Queue;

  private readonly INSURANCE_ID = 'insurance:id';
  private readonly INSURANCE_LOCK_SIGNATURE = (id: string) =>
    `lock:insurance:${id}`;

  constructor(
    @InjectModel(Insurance.name)
    private readonly insuranceModel: Model<Insurance>,
    @InjectModel(AssetConfig.name)
    private readonly assetConfigModel: Model<AssetConfig>,
    @InjectModel(PeriodConfig.name)
    private readonly configPeriodModel: Model<PeriodConfig>,
    @InjectModel(InsuranceLog.name)
    private readonly insuranceLogModel: Model<InsuranceLog>,
    @InjectModel(OnchainHistory.name)
    private readonly onchainHistoryModel: Model<OnchainHistory>,

    private readonly insuranceCache: InsuranceCache,
    private readonly cacheService: CacheService,
    private readonly lockService: LockService,
    private readonly priceService: PriceService,
    private readonly walletService: WalletService,
    private readonly binanceService: BinanceService,
    private readonly esService: ElasticsearchService,
    private readonly socketService: SocketService,

    @InjectQueue(INSURANCE_QUEUE_NAME)
    private readonly _insuranceQueue: Queue,
    @InjectQueue(BINANCE_QUEUE_NAME)
    private readonly _binanceQueue: Queue,

    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly namiSlack: NamiSlack,
  ) {
    this.insuranceQueue = this._insuranceQueue;
    this.binanceQueue = this._binanceQueue;
  }

  async buyInsurance(auth: TokenPayLoad, payload: BuyInsuranceRequestDTO) {
    const { id: userId, code: namiCode } = auth;
    const {
      margin,
      period,
      q_covered,
      p_claim,
      day_change_token,
      asset_covered,
      asset_refund,
      unit,
      quote_asset,
      futures_order_id,
      ref,
      period_unit,
    } = payload;

    const symbol = `${asset_covered}${unit}`;

    const p_open = this.priceService.price(symbol, {
      base: asset_covered,
      quote: unit,
    })?.lastPrice;

    console.log(
      this.priceService.price(symbol, {
        base: asset_covered,
        quote: unit,
      }),
    );

    const { isValid } = validateMargin(p_open, payload);
    if (!isValid) {
      throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_MARGIN);
    }

    if (period_unit === PERIOD_TYPE.HOUR && period !== 4) {
      throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_TIME);
    }

    const { expired, hedge, p_stop, side_insurance, q_claim } =
      calculateInsuranceStat({
        period,
        margin,
        q_covered,
        p_open,
        p_claim,
        day_change_token,
        period_unit,
      });

    const quantity = calculateFuturesBnbQuantity({
      margin,
      p_open,
      p_claim,
      hedge,
      day_change_token,
    });

    const validatedInput = await this.validateSymbol({
      asset_covered,
      p_open,
      p_claim,
      quantity,
      p_stop,
    });

    const _id = await this.getIdInsurance();

    let binanceOrder = {
      id_binance: 0,
      sl: null,
      tp: null,
      position: null,
      origin_quantity: 0,
    };

    // TODO binance
    try {
      if (margin > BINANCE_ORDER_MARGIN) {
        if (!validatedInput.isValid) {
          this.namiSlack.sendSlackMessage('BUY INSURANCE ERROR', {
            userId,
            payload,
            validatedInput,
          });
        } else {
        }
        binanceOrder = await this.placeBinanceFuturesOrder({
          insurance_id: _id,
          p_open: validatedInput.p_market,
          p_claim: validatedInput.p_claim_binance,
          quantity: validatedInput.quantity_binance,
          asset_covered,
          day_change_token,
          p_stop: validatedInput.p_stop_binance,
          unit: unit ?? DEFAULT_TOKEN_UNIT,
        });
      }
    } catch (error) {
      this.namiSlack.sendSlackMessage('BUY INSURANCE ERROR', {
        userId,
        payload,
        error,
      });
    }

    const newInsurance = new this.insuranceModel({
      _id,
      owner: userId,
      nami_id: namiCode,
      q_covered,
      asset_covered,
      asset_refund: asset_refund ?? DEFAULT_TOKEN_UNIT,
      day_change_token,
      margin,
      p_claim,
      p_market: p_open,
      p_stop,
      period,
      q_claim,
      type: INSURANCE_TYPE.MARKET,
      state: INSURANCE_STATE.AVAILABLE,
      unit: unit ?? DEFAULT_TOKEN_UNIT,
      quote_asset: quote_asset ?? DEFAULT_TOKEN_UNIT,
      expired,
      side: side_insurance,
      futures_order_id,
      binance: binanceOrder,
      period_unit,
      origin_quantity: binanceOrder.origin_quantity,
    });

    const transactionHistories = [];

    try {
      // lock margin
      transactionHistories.push(
        await this.walletService.changeBalance({
          userId,
          assetId: CURRENCIES[unit],
          valueChange: null,
          lockedValueChange: margin,
          category: String(
            TRANSACTION_CATEGORY_GROUP[HistoryType.INSURANCE].INSURANCE_BUY,
          ),
          note: `#${_id} ${NOTE_TITLES.EN.REASON.OPEN_ORDER} ${NOTE_TITLES.EN.ACTION.LOCK}`,
          options: JSON.stringify({
            walletType: WALLET_TYPES.INSURANCE,
            metadata: {
              insurance: newInsurance,
            },
          }),
        }),
      );

      await this.insuranceCache.setOneActiveInsurance(newInsurance);

      await newInsurance.save();

      await this.insuranceLogModel.create({
        insuranceId: newInsurance._id,
        message: 'New Insurance',
        metadata: [
          {
            field: 'state',
            from: null,
            to: newInsurance.state,
          },
        ],
      });

      // add history landing page
      this.onchainHistoryModel.create({
        insurance_id: _id,
        state: INSURANCE_STATE.AVAILABLE,
        from: namiCode,
        to: TRANSFER_HISTORY.MARGIN,
        asset_cover: asset_covered,
        unit,
        side: side_insurance,
        amount: margin,
        type: TRANSFER_HISTORY.OFFCHAIN,
      });

      // emit event to user and exchange
      this.emitUpdateInsuranceToUser(newInsurance.toObject());
      this.emitUpdateInsuranceToNami({
        symbol: asset_covered,
        namiUserId: userId,
        futuresOrderId: futures_order_id,
      });

      return {
        ...omit(newInsurance.toObject(), ['binance']),
        changed_time: Date.now(),
        isValid: true,
      };
    } catch (error) {
      this.namiSlack.sendSlackMessage('BUY INSURANCE ERROR', {
        userId,
        payload,
        error,
      });
      this.logger.error('BUY INSURANCE ERROR', {
        userId,
        payload,
        error,
      });
      if (transactionHistories && transactionHistories?.length) {
        this.namiSlack.sendSlackMessage('BUY INSURANCE ROLLBACK WALLET', {
          userId,
          payload,
          error,
          transactionHistories,
        });
        this.logger.error('BUY INSURANCE ROLLBACK WALLET', {
          userId,
          payload,
          error: new Error(error),
          transactionHistories,
        });
        this.walletService.rollback({
          transactions: transactionHistories,
        });
      }
      throw error;
    }
  }

  private async validateSymbol(payload: {
    asset_covered: string;
    p_open: number;
    p_claim: number;
    quantity: number;
    p_stop: number;
    unit?: string;
  }) {
    const {
      asset_covered,
      p_open,
      p_claim,
      p_stop,
      quantity,
      unit = 'USDT', // default usdt
    } = payload;

    const config = await this.cacheService.getOneCached(
      `assetconfig:${asset_covered}${unit}`,
      async () =>
        await this.assetConfigModel
          .findOne({
            symbol: `${asset_covered}${unit}`,
          })
          .read('s')
          .lean(),
      MINUTES_TO_MILLISECONDS.ONE,
    );

    if (!config || config?.isMaintain) {
      return {
        isValid: false,
        message: EXCEPTION.INSURANCE.MAINTAINED,
      };
    }

    if (config.isMaxQty) {
      throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_QUANTITY_ASSET);
    }

    let p_stop_binance = 0;
    let p_claim_binance = 0;
    let quantity_binance = 0;
    let p_market = 0;

    if (config) {
      p_stop_binance = Number(Big(p_stop).toFixed(config.pricePrecision));
      p_claim_binance = Number(Big(p_claim).toFixed(config.pricePrecision));
      p_market = Number(Big(p_open).toFixed(config.pricePrecision));
      quantity_binance = Number(
        Big(quantity).toFixed(config.quantityPrecision),
      );

      // validate filter
      const listFilter = config.filters;
      const avgConfig = await this.getConfigPeriod(asset_covered);
      let min_p_claim: number, max_p_claim: number;

      if (p_claim < p_open) {
        min_p_claim = Number(
          Big(p_open)
            .minus(
              Big(avgConfig[avgConfig.length - 1])
                .plus(CLAIM_MIN_RATIO)
                .times(p_open),
            )
            .toFixed(config.pricePrecision),
        );

        max_p_claim = Number(
          Big(p_open)
            .minus(Big(avgConfig[0]).minus(CLAIM_MIN_RATIO).times(p_open))
            .toFixed(config.pricePrecision),
        );
      } else {
        min_p_claim = Number(
          Big(p_open)
            .plus(Big(avgConfig[0]).minus(CLAIM_MIN_RATIO).times(p_open))
            .toFixed(DEFAULT_DECIMAL),
        );

        max_p_claim = Number(
          Big(p_open)
            .plus(
              Big(avgConfig[avgConfig.length - 1])
                .plus(CLAIM_MIN_RATIO)
                .times(p_open),
            )
            .toFixed(DEFAULT_DECIMAL),
        );
      }

      if (p_claim_binance < min_p_claim || p_claim_binance > max_p_claim) {
        throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_P_CLAIM);
      }

      const validate_input = symbolFilter(
        listFilter[FILTER_TYPE],
        FILTER_TYPE,
        p_market,
        p_open,
      );
      if (!validate_input.isValid) {
        throw new BadRequestException(validate_input.data);
      }
    } else {
      throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_ASSET_COVER);
    }
    return {
      isValid: true,
      p_stop_binance,
      p_claim_binance,
      p_market,
      quantity_binance,
    };
  }

  private async getConfigPeriod(asset_covered: string, unit = 'USDT') {
    const config_period_token = await this.cacheService.getOneCached(
      `configperiod:${asset_covered}${unit}`,
      async () =>
        await this.configPeriodModel
          .findOne({
            token: `${asset_covered.toUpperCase().trim()}${unit}`,
          })
          .lean(),
      MINUTES_TO_MILLISECONDS.ONE,
    );
    const list_day_avg: number[] = [];
    for (let i = 0; i < 15; i++) {
      const cur_avg = config_period_token.list_ratio_change[i];
      if (cur_avg <= 0.985) {
        list_day_avg.push(cur_avg);
      } else {
        break;
      }
    }
    return list_day_avg;
  }

  private async getIdInsurance(): Promise<string> {
    // return parseInt(hashId);
    const id = await this.cacheService.redisCache.incr(this.INSURANCE_ID);
    if (id) {
      const existed = await this.insuranceModel.exists({ _id: id });
      if (existed) {
        return this.getIdInsurance();
      }
      return String(id);
    }
    const startFrom = 100000;
    this.cacheService.redisCache.set(this.INSURANCE_ID, startFrom);
    return String(startFrom);
  }

  private async placeBinanceFuturesOrder(payload: {
    insurance_id: string;
    p_open: number;
    p_claim: number;
    quantity: number;
    asset_covered: string;
    day_change_token: number;
    p_stop: number;
    unit: string;
  }) {
    const {
      insurance_id,
      p_open,
      p_claim,
      p_stop,
      asset_covered,
      quantity,
      unit,
    } = payload;
    const symbol = asset_covered + unit;
    const binanceAccounts = this.binanceService.binanceCredentials;
    const side = p_claim < p_open ? POSITION_SIDE.SHORT : POSITION_SIDE.LONG;
    // p_claim < p_market ? "SELL" : "BUY"

    const notifyError = (binanceId, reason = null) => {
      this.namiSlack.sendSlackMessage(
        `Lỗi không đặt được lệnh binance: {
        Id_binance: ${binanceId},
        Insurance id: ${insurance_id},
        Symbol: ${asset_covered},
        Type: stop_loss,
        Expect: ${side},
        P-Open: ${p_open},
        P-Claim: ${p_claim},
        P-Expired: ${p_stop},
        Quantity: ${quantity},
        Ký quỹ bảo hiểm
        Nguyên nhân: ${'Cannot open position'},
        errCode: -1,
      }`,
        { reason },
      );
    };

    if (binanceAccounts?.length === 0) {
      notifyError('-', 'No binance account');
      return {
        id_binance: null,
        sl: null,
        tp: null,
        position: null,
        origin_quantity: 0,
      };
    }

    let position: any;
    let takeProfit: any;
    let stopLoss: any;
    let binanceId: number;

    try {
      for (let i = 0; i < binanceAccounts?.length; i++) {
        const credential = binanceAccounts[i];
        binanceId = credential.id;
        const { sl, tp } = await this.handlePlaceOrder(
          {
            side,
            symbol,
            quantity,
            insuranceId: insurance_id,
            p_stop,
            p_claim,
          },
          credential,
        );

        takeProfit = tp;
        stopLoss = sl;

        position = await this.handlePlacePosition(
          {
            clientOrderId: insurance_id,
            symbol,
            quantity,
            side,
          },
          credential,
        );

        // check error order
        const slError = !isSuccessResponse(sl);
        const tpError = !isSuccessResponse(tp);
        const positionError = !isSuccessResponse(position);

        if (slError || tpError || positionError) {
          if (slError) {
            await this.binanceService.cancelFuturesOrder(
              {
                symbol,
                orderId: sl.orderId,
              },
              credential,
            );
          }
          if (tpError) {
            await this.binanceService.cancelFuturesOrder(
              {
                symbol,
                orderId: tp.orderId,
              },
              credential,
            );
          }

          continue;
        }

        break;
      }
    } catch (error) {
      notifyError(binanceId, error);
    }
    return {
      id_binance: binanceId,
      sl: stopLoss,
      tp: takeProfit,
      position,
      origin_quantity: quantity,
    };
  }

  private async handlePlacePosition(
    payload: {
      symbol: string; // includes USDT
      quantity: number;
      clientOrderId: string;
      side: POSITION_SIDE;
    },
    credentials: IBinanceCredential,
  ) {
    const { symbol, quantity, clientOrderId, side } = payload;
    return this.binanceService.placeFuturesOrder(
      {
        symbol,
        side: {
          [POSITION_SIDE.LONG]: ORDER_SIDE.BUY,
          [POSITION_SIDE.SHORT]: ORDER_SIDE.SELL,
        }[side],
        quantity,
        newClientOrderId: clientOrderId + '_OPEN',
        type: ORDER_TYPE.MARKET,
        positionSide: side,
      },
      credentials,
    );
  }

  private async handlePlaceOrder(
    payload: {
      side: POSITION_SIDE;
      symbol: string;
      quantity: number;
      insuranceId: string;
      p_stop: number;
      p_claim: number;
    },
    binanceAccount: IBinanceCredential,
  ) {
    const { side, symbol, quantity, insuranceId, p_stop, p_claim } = payload;
    let slPosition: any;
    let tpPosition: any;
    if (side === POSITION_SIDE.SHORT) {
      slPosition = await this.binanceService.placeFuturesOrder(
        {
          symbol,
          quantity,
          side: ORDER_SIDE.BUY,
          newClientOrderId: insuranceId + '_SL',
          stopPrice: p_stop,
          type: ORDER_TYPE.STOP_MARKET,
          priceProtect: true,
          positionSide: side,
        },
        binanceAccount,
      );
      tpPosition = await this.binanceService.placeFuturesOrder(
        {
          symbol,
          quantity,
          side: ORDER_SIDE.BUY,
          newClientOrderId: insuranceId + '_TP',
          stopPrice: p_claim,
          type: ORDER_TYPE.TAKE_PROFIT_MARKET,
          priceProtect: true,
          positionSide: side,
        },
        binanceAccount,
      );
    } else {
      slPosition = await this.binanceService.placeFuturesOrder(
        {
          symbol,
          quantity,
          side: ORDER_SIDE.SELL,
          newClientOrderId: insuranceId + '_SL',
          stopPrice: p_stop,
          type: ORDER_TYPE.STOP_MARKET,
          priceProtect: true,
          positionSide: side,
        },
        binanceAccount,
      );
      tpPosition = await this.binanceService.placeFuturesOrder(
        {
          symbol,
          quantity,
          side: ORDER_SIDE.SELL,
          newClientOrderId: insuranceId + '_TP',
          stopPrice: p_claim,
          type: ORDER_TYPE.TAKE_PROFIT_MARKET,
          priceProtect: true,
          positionSide: side,
        },
        binanceAccount,
      );
    }

    return { sl: slPosition, tp: tpPosition };
  }

  /**
   * @deprecated use cancelInsurance in insurance-backend instead
   */
  async cancelInsurance(auth: TokenPayLoad, _id: string) {
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

          await this.insuranceCache.delActiveInsurances([_id]);

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
}
