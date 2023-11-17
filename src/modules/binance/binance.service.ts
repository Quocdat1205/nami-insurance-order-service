import { FuturesPlaceOrderRequestDTO } from '@modules/binance/dtos/futures.dto';
import { BINANCE_QUEUE_NAME } from '@modules/binance/constants';
import { Inject, Injectable } from '@nestjs/common';
import axios, { AxiosResponse, Method } from 'axios';
import config from '@configs/configuration';
import { buildQueryString, removeEmptyValue } from '@modules/binance/utils';
import * as crypto from 'crypto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { NamiSlack } from '@commons/modules/logger/platforms/slack.module';
import fs from 'fs';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { HTTP_METHOD } from '@commons/constants';

export interface IBinanceCredential {
  id: number;
  binanceApiSecret: string;
  binanceApiKey: string;
}

@Injectable()
export class BinanceService {
  private readonly BINANCE_API_FUTURES_PREFIX = '/fapi/v1';
  private readonly BINANCE_API_ENDPOINT = {
    PLACE_ORDER: this.BINANCE_API_FUTURES_PREFIX + '/order',
  };

  private readonly binanceAxios = axios.create({
    baseURL: config.BINANCE.API_BASE_URL,
    headers: { 'X-MBX-APIKEY': config.BINANCE.API_KEY },
    // validateStatus: () => true,
  });

  public readonly binanceCredentials: IBinanceCredential[] = [];

  public readonly queue: Queue;

  constructor(
    @InjectQueue(BINANCE_QUEUE_NAME) private readonly binanceQueue: Queue,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly namiSlack: NamiSlack,
  ) {
    this.queue = this.binanceQueue;
    const bnbConfigPath = './binance.config.json';
    if (fs.existsSync(bnbConfigPath)) {
      const file = fs.readFileSync(bnbConfigPath);
      const parsedFile = JSON.parse(file.toString());
      console.info('LOAD BINANCE ACCOUNTS', parsedFile);
      for (const accountInfo of parsedFile) {
        this.binanceCredentials.push({
          id: accountInfo.id,
          binanceApiKey: accountInfo.api_key,
          binanceApiSecret: accountInfo.api_secret,
        });
        // }
      }
    }
  }

  // !IMPORTANT please DO NOT spam this api or you will be blocked by Binance
  // each endpoint has different rate limit
  private async makeBinanceRequest<T = any>({
    method,
    path,
    params,
    credentials,
  }: {
    method: Method;
    path: string;
    params?: any;
    slackWarning?: boolean;
    credentials?: IBinanceCredential;
  }): Promise<AxiosResponse<{ message: string; code: string } & T>> {
    try {
      params = removeEmptyValue(params);
      this.logger.info('makeBinanceRequest', {
        binanceId: credentials?.id,
        method,
        path,
        params,
      });
      const timestamp = Date.now();
      const queryString = buildQueryString({ ...params, timestamp });
      const signature = crypto
        .createHmac(
          'sha256',
          credentials?.binanceApiSecret ?? config.BINANCE.API_SECRET,
        )
        .update(queryString)
        .digest('hex');
      const apiKey = credentials?.binanceApiKey
        ? { 'X-MBX-APIKEY': credentials?.binanceApiKey }
        : null;
      return await this.binanceAxios.request({
        url: path,
        headers: apiKey,
        method,
        params: {
          ...params,
          timestamp,
          signature,
        },
      });
    } catch (error) {
      const _error = error?.response?.data ?? error?.data ?? error.message;
      const log = {
        method,
        path,
        params,
        binanceId: credentials?.id,
        error: _error,
      };
      this.logger.error('makeBinanceRequest ERROR', log);
      this.namiSlack.slack.postMessage({
        text: 'BINANCE REQUEST ERROR',
        blocks: [
          {
            type: 'header',
            text: {
              emoji: true,
              type: 'plain_text',
              text: `:pepecry: \t MAKE BINANCE REQUEST ERROR ${new Date().toISOString()}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `_Payload_`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`\`\`${JSON.stringify(log, null, 2)}\`\`\``,
            },
          },
        ],
      });
      return error?.response;
    }
  }

  async placeFuturesOrder(
    payload: FuturesPlaceOrderRequestDTO,
    credentials?: IBinanceCredential,
  ) {
    const response = await this.makeBinanceRequest({
      method: HTTP_METHOD.POST,
      path: this.BINANCE_API_ENDPOINT.PLACE_ORDER,
      params: payload,
      credentials,
    });
    return response?.data;
  }

  async cancelFuturesOrder(
    payload: {
      symbol: string;
      orderId: number;
      origClientOrderId?: string;
    },
    credentials?: IBinanceCredential,
  ) {
    const response = await this.makeBinanceRequest({
      method: HTTP_METHOD.DELETE,
      path: this.BINANCE_API_ENDPOINT.PLACE_ORDER,
      params: payload,
      credentials,
    });
    return response?.data;
  }

  getBinanceCredential(binanceId: number) {
    return this.binanceCredentials.find(
      (o) => Number(o.id) === Number(binanceId),
    );
  }
}
