export const INSURANCE_QUEUE_NAME = 'insurance';

export const INSURANCE_QUEUE_ACTION = {
  HIT_SLTP: 'hit-sltp',
};

export const INSURANCE_ACTION = {
  SL: 'sl',
  TP: 'tp',
};

//Insurance Config
export const CLAIM_MIN_RATIO = 0.02;
export const FILTER_TYPE = 6;
export const DEFAULT_TOKEN_UNIT = 'USDT';
export const PRICE_CLAIM_DIFFERENT_RATIO = 0.003;
export const MIN_HEDGE_RATIO = 0.018;
export const MAX_HEDGE_RATIO = 0.12;
export const MIN_MARGIN = 0.1; // 2% 5USDT
export const MIN_Q_COVER = 5;
export const MAX_Q_COVER = 10000;
export const DEFAULT_DECIMAL = 8;
export const FUTURES_STOP_DIFF = -0.03;
export const RISK_CONFIG = 0.95;
export const CHANGE_AVG = 0.0699;
export const BINANCE_ORDER_MARGIN = 300;
export const P_REFUND_RATIO = 0.005;

export const NOTE_TITLES = {
  VI: {
    ACTION: {
      LOCK: 'Mở khóa kí quỹ',
      UNLOCK: 'Khóa kí quỹ',
      INCREMENT: 'Cộng số dư ví',
      DECREMENT: 'Trừ số dư ví',
    },
    REASON: {
      OPEN_ORDER: 'Mở hợp đồng',
      LIQUIDATED: 'Đã thanh lý',
      CLAIM: 'Đã chi trả',
      REFUNDED: 'Đã hoàn trả',
      CANCELED: 'Dừng hợp đồng trước hạn',
    },
  },
  EN: {
    ACTION: {
      LOCK: 'Lock margin',
      UNLOCK: 'Unlock margin',
      INCREMENT: 'Increase balance',
      DECREMENT: 'Descrease balance',
    },
    REASON: {
      OPEN_ORDER: 'Open order',
      LIQUIDATED: 'Liquidated order',
      CLAIM: 'Claimed order',
      REFUNDED: 'Refunded order',
      CANCELED: 'Canceled order',
    },
  },
};

export const Q_CLAIM_CONFIG = [
  {
    hedge: 0.02,
    x: 0.14,
  },
  {
    hedge: 0.03,
    x: 0.12,
  },
  {
    hedge: 0.04,
    x: 0.1,
  },
  {
    hedge: 0.05,
    x: 0.03,
  },
  {
    hedge: 0.06,
    x: 0.12,
  },
  {
    hedge: 0.07,
    x: 0.05,
  },
  {
    hedge: 0.08,
    x: -0.05,
  },
  {
    hedge: 0.09,
    x: 0,
  },
  {
    hedge: 0.1,
    x: 0.03,
  },
];

export const HOUR_Q_CLAIM_CONFIG = [
  {
    hedge: 0.02,
    x: 0.1,
  },
  {
    hedge: 0.03,
    x: 0.08,
  },
  {
    hedge: 0.04,
    x: 0.06,
  },
  {
    hedge: 0.05,
    x: 0.01,
  },
  {
    hedge: 0.06,
    x: 0.05,
  },
  {
    hedge: 0.07,
    x: 0.03,
  },
  {
    hedge: 0.08,
    x: -0.07,
  },
  {
    hedge: 0.09,
    x: -0.07,
  },
  {
    hedge: 0.1,
    x: 0.05,
  },
];

export const generateFuturesInsuranceKey = (userId, futuresOrderId) =>
  `insurance:${userId}:${futuresOrderId}`;

export enum TRANSFER_HISTORY {
  SYSTEM = 'System',
  OFFCHAIN = 'offchain',
  ONCHAIn = 'onchain',
  MARGIN = 'Margin pool',
  CLAIM = 'Claim pool',
  FUND = 'Nami insurance fund',
}
