export const BINANCE_QUEUE_NAME = 'binance';

export const BINANCE_QUEUE_ACTION = {
  PLACE_FUTURES_ORDER: 'place-futures-order',
  CANCEL_FUTURES_ORDER: 'cancel-futures-order',
};

export enum POSITION_SIDE {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum ORDER_SIDE {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum ORDER_TYPE {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
  STOP = 'STOP',
  STOP_MARKET = 'STOP_MARKET',
  TAKE_PROFIT = 'TAKE_PROFIT',
  TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET',
  TRAILING_STOP_MARKET = 'TRAILING_STOP_MARKET',
}
