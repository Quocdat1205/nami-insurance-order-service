import { ReadPreference } from 'mongodb';
import { ASSETS, CURRENCIES } from '@commons/constants/currencies';
import { BadRequestException, Injectable, Logger, Scope } from '@nestjs/common';
import Big from 'big.js';
import {
  BookTicker,
  HighLowIntervalPrice,
  HighLowIntervalSubscribers,
  ISymbolTickerStreamPayload,
  SymbolTicker,
  Ticker,
  WsConnection,
} from '@modules/price/types';
import { WebSocket } from 'ws';
import { Exception } from '@commons/constants/exception';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import config from '@configs/configuration';
import { NamiSlack } from '@commons/modules/logger/platforms/slack.module';
import {
  MINUTES_TO_MILLISECONDS,
  SECONDS_TO_MILLISECONDS,
} from '@commons/constants';
import { Interval } from '@nestjs/schedule';

@Injectable({
  scope: Scope.DEFAULT,
})
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly BINANCE_FUTURES_STREAMS_URL = 'wss://fstream.binance.com';
  private readonly PRICE_SPREAD_RATIO = config.PRICE_SPREAD_RATIO;
  private readonly PRICE_DECIMAL = 8;
  private readonly wsConnections = new Map<string, WsConnection>();
  /**
   * @Public
   * @description USDT/VNDC Market Rate (updated each 10 minutes)
   */
  public readonly USDT_VNDC_RATE = {
    bid: 24000 - 120,
    ask: 24000 + 120,
    price: 24000,
  };

  /**
   * @Public
   * @description Current price of all listed symbols
   *
   * @returns
   * @example
   * {
   *   'BTCUSDT': {
   *      'symbol': 'BTCUSDT',
   *      'bestBid': 26980, (gia mua thap nhat)
   *      'bestAsk': 27020, (gia ban cao nhat)
   *      'lastPrice': 27000 (gia hien tai)
   *   },
   *   'ETHUSDT': {
   *      ...
   *   },
   *   ...
   * }
   */
  public readonly bookTickers: BookTicker = {};

  private readonly highLowIntervalSubscribers: HighLowIntervalSubscribers = {};

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly namiSlack: NamiSlack,
  ) {
    this.initSymbolTickersStream();
  }

  /**
   * @tutorial you can use any list of symbol you want (symbols must be listed on Binance)
   *
   * @example ['BTCUSDT', 'ETHUSDT', ...]
   *
   * @default `in this example im using symbol list from exchangeconfigs`
   */
  private initSymbolTickersStream() {
    this.connection
      .collection('configassets', {
        readPreference: ReadPreference.SECONDARY,
      })
      .find({
        status: 'TRADING',
        quoteAsset: ASSETS[CURRENCIES.USDT],
      })
      .project<{ symbol: string }>({
        symbol: true,
      })
      .toArray()
      .then((data) => {
        console.log(`Init ticker stream of ${data.length} symbols`);
        data.map((e) => this.startSymbolTickerStream(e.symbol));
      });
  }

  private startSymbolTickerStream(symbol: string, retry = 0) {
    symbol = symbol.toUpperCase();
    if (retry > config.NICE) {
      console.error(`Failed to stream ${symbol} ticker`);
      this.namiSlack.sendSlackMessage(`Failed to stream ${symbol} ticker`);
      return;
    }
    const ws = new WebSocket(
      `${this.BINANCE_FUTURES_STREAMS_URL}/ws/${symbol?.toLowerCase()}@ticker`,
      {
        timeout: SECONDS_TO_MILLISECONDS.TEN,
      },
    );
    ws.on('ping', () => {
      ws.pong();
      const connection = this.wsConnections.get(symbol);
      if (connection) connection.lastUpdated = Date.now();
    });

    ws.on('error', () => {
      console.error(`${symbol} ticker stream error`);
    });

    ws.on('close', () => {
      const wsConnection = this.wsConnections.get(symbol);
      if (!wsConnection?.closeInitiated) {
        console.error(
          `${symbol} ticker stream close`,
          `Retried to stream ${symbol}: ${retry}`,
        );
        this.bookTickers[symbol] = null;
        setTimeout(
          () => this.startSymbolTickerStream(symbol, retry + 1),
          SECONDS_TO_MILLISECONDS.FIVE,
        );
      } else if (wsConnection) {
        wsConnection.closeInitiated = false;
      }
    });

    ws.on('message', (payload: Buffer) => this.processPriceStream(payload));

    this.wsConnections.set(symbol, {
      ws,
      closeInitiated: false,
      lastUpdated: Date.now(),
    });
  }

  private processPriceStream(_payload: Buffer) {
    const payload: ISymbolTickerStreamPayload = JSON.parse(String(_payload));
    try {
      if (payload?.s?.startsWith('DODOX')) {
        payload.s = payload?.s?.replace('DODOX', 'DODO');
      }
      const data = new SymbolTicker(payload);
      const usdtConvertRate = {
        bid: 1 - this.PRICE_SPREAD_RATIO,
        ask: 1 + this.PRICE_SPREAD_RATIO,
        price: 1,
      };
      this.updateBookTicker(data, usdtConvertRate);
      const wsConnection = this.wsConnections.get(payload.s);
      if (wsConnection) wsConnection.lastUpdated = Date.now();
    } catch (error) {
      console.error(error);
      this.namiSlack.sendSlackMessage(
        'processPriceStream ERROR',
        new Error(error),
      );
    }
  }

  private updateBookTicker(
    data: SymbolTicker,
    rate: { bid: number; ask: number; price: number },
  ) {
    const symbol = data.symbol;
    const { lastPrice: currentPrice } = data;
    const _lastPrice = Number(
      Big(currentPrice).times(rate.price).toFixed(this.PRICE_DECIMAL),
    );
    const lastTickerPrice = this.bookTickers?.[symbol]?.lastPrice ?? 0;
    let matchOrderAction = 'buy';
    if (lastTickerPrice > 0) {
      matchOrderAction = currentPrice > lastTickerPrice ? 'buy' : 'sell';
    }
    const closeBuy = Number(
      Big(currentPrice).times(rate.bid).toFixed(this.PRICE_DECIMAL),
    );
    const closeSell = Number(
      Big(currentPrice).times(rate.ask).toFixed(this.PRICE_DECIMAL),
    );
    const closePrice = matchOrderAction === 'buy' ? closeSell : closeBuy;
    const priceData: Ticker = {
      symbol,
      bestBid: closePrice,
      bestAsk: closePrice,
      lastPrice: _lastPrice,
    };
    this.bookTickers[symbol] = priceData;
    this.updateHighLowInterval(symbol, priceData);
  }

  private updateHighLowInterval(symbol: string, price: Ticker) {
    Object.keys(this.highLowIntervalSubscribers).map((name) => {
      const { subscription, interval } = this.highLowIntervalSubscribers[name];
      const { bestBid, bestAsk } = price;
      const symbolPrice = {
        bidLow: bestBid,
        bidHigh: bestBid,
        askLow: bestAsk,
        askHigh: bestAsk,
        lastTick: Date.now(),
      };
      if (this.highLowIntervalSubscribers[name]?.reset) {
        this.highLowIntervalSubscribers[name].reset = false;
        setTimeout(async () => {
          subscription(this.highLowIntervalSubscribers[name]?.price);
          this.highLowIntervalSubscribers[name].reset = true;
        }, interval);
        this.highLowIntervalSubscribers[name].price = {
          [symbol]: symbolPrice,
        };
      } else {
        if (!this.highLowIntervalSubscribers[name]?.price?.[symbol]) {
          this.highLowIntervalSubscribers[name].price[symbol] = symbolPrice;
        } else {
          const currentHighLow =
            this.highLowIntervalSubscribers[name]?.price?.[symbol];
          if (!currentHighLow.bidLow || currentHighLow.bidLow >= bestBid) {
            currentHighLow.bidLow = bestBid;
          }
          if (!currentHighLow.askLow || currentHighLow.askLow >= bestAsk) {
            currentHighLow.askLow = bestAsk;
          }
          if (!currentHighLow.bidHigh || currentHighLow.bidHigh <= bestBid) {
            currentHighLow.bidHigh = bestBid;
          }
          if (!currentHighLow.askHigh || currentHighLow.askHigh <= bestBid) {
            currentHighLow.askHigh = bestAsk;
          }
          this.highLowIntervalSubscribers[name].price[symbol] = currentHighLow;
        }
      }
    });
  }

  /**
   * @Public
   * @description subscribe for high and low price in an interval with a callback
   *
   * @param name	what ever u want, must be unique
   * @param interval	your interval time for high and low price (in ms)
   * @param cb	your callback func that need high and low price as payload
   *
   * @example
   * this.priceService.subscribeHighLowInterval(
   *   'demo',
   *   3000,
   *   (data: HighLowIntervalPrice) => handlePriceData(data)
   * );
   */
  public subscribeHighLowInterval(
    name: string,
    interval: number,
    cb: (data: HighLowIntervalPrice) => void,
  ) {
    if (this.highLowIntervalSubscribers[name]) {
      throw new BadRequestException(Exception.EXISTED(`subscriber ${name}`));
    }
    this.highLowIntervalSubscribers[name] = {
      subscription: cb,
      interval,
      price: null,
      reset: true,
    };
  }

  /**
   * @Public
   *
   * @description Returns the price of a symbol or pair of symbols.
   *
   * @param symbol - The symbol to get the price for.
   * @param pair - An optional object containing the base and quote symbols for the pair.
   *
   * @returns An object containing the best bid, best ask, and last price of the symbol or pair, or null if the price cannot be determined.
   */
  public price(
    symbol: string,
    pair?: { base?: string; quote?: string },
    _bookTickers?: BookTicker,
  ): Ticker {
    const bookTickers = _bookTickers || this.bookTickers;
    const price = bookTickers[symbol];
    if (price) return price;
    const quotes = [
      ASSETS[CURRENCIES.VNST],
      ASSETS[CURRENCIES.VNDC],
      ASSETS[CURRENCIES.USDT],
    ];
    const _quote =
      quotes.find((e) => e !== pair.base && e !== pair.quote) ??
      ASSETS[CURRENCIES.USDT];
    const baseTicker: Ticker = {
      bestAsk: 1,
      bestBid: 1,
      lastPrice: 1,
      symbol: null,
    };
    const basePrice =
      pair.base === _quote ? baseTicker : bookTickers[`${pair.base}${_quote}`];
    const quotePrice =
      pair.quote === _quote
        ? baseTicker
        : bookTickers[`${pair.quote}${_quote}`];
    if (!basePrice || !quotePrice) {
      return null;
    }
    return {
      symbol,
      bestBid: Number(
        Big(basePrice.bestBid)
          .div(quotePrice.bestBid)
          .toFixed(this.PRICE_DECIMAL),
      ),
      bestAsk: Number(
        Big(basePrice.bestAsk)
          .div(quotePrice.bestAsk)
          .toFixed(this.PRICE_DECIMAL),
      ),
      lastPrice: Number(
        Big(basePrice.lastPrice)
          .div(quotePrice.lastPrice)
          .toFixed(this.PRICE_DECIMAL),
      ),
    };
  }

  public highLowPrice(
    symbol: string,
    pair: { base?: string; quote?: string },
    highLow: HighLowIntervalPrice,
  ) {
    const price = highLow[symbol];
    if (price) return price;
    const quotes = [
      ASSETS[CURRENCIES.VNST],
      ASSETS[CURRENCIES.VNDC],
      ASSETS[CURRENCIES.USDT],
    ];
    const _quote =
      quotes.find((e) => e !== pair.base && e !== pair.quote) ??
      ASSETS[CURRENCIES.USDT];

    const base = {
      bidLow: 1,
      askLow: 1,
      bidHigh: 1,
      askHigh: 1,
      lastTick: 1,
    };
    const basePrice =
      pair.base === _quote ? base : highLow[`${pair.base}${_quote}`];
    const quotePrice =
      pair.quote === _quote ? base : highLow[`${pair.quote}${_quote}`];
    if (!basePrice || !quotePrice) {
      console.log(symbol, 'no price wtf');
      return null;
    }
    return {
      bidLow: Number(
        Big(basePrice.bidLow)
          .div(quotePrice.bidLow)
          .toFixed(this.PRICE_DECIMAL),
      ),
      askLow: Number(
        Big(basePrice.askLow)
          .div(quotePrice.askLow)
          .toFixed(this.PRICE_DECIMAL),
      ),
      bidHigh: Number(
        Big(basePrice.bidHigh)
          .div(quotePrice.bidHigh)
          .toFixed(this.PRICE_DECIMAL),
      ),
      askHigh: Number(
        Big(basePrice.askHigh)
          .div(quotePrice.askHigh)
          .toFixed(this.PRICE_DECIMAL),
      ),
      lastTick: basePrice.lastTick,
    };
  }

  @Interval(SECONDS_TO_MILLISECONDS.TEN)
  checkAliveWsConnections() {
    this.wsConnections.forEach((wsConnection, symbol) => {
      if (
        Math.abs(Date.now() - wsConnection.lastUpdated) >
        MINUTES_TO_MILLISECONDS.THREE
      ) {
        this.logger.warn(
          `Symbol ${symbol} ticker stream not updated in 3 minutes, restarting...`,
        );
        wsConnection.closeInitiated = true;
        wsConnection.ws.close();
        wsConnection.ws.terminate();
        this.startSymbolTickerStream(symbol);
      }
    });
  }
}
