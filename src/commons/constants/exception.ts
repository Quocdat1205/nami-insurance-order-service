import { capitalizeFirstLetter, removeSpecialCharacters } from '@commons/utils';

export const Exception = {
  EXISTED: (text: string) => generateError(`${text} existed`),
  NOT_EXISTED: (text: string) => generateError(`${text} not existed`),
  NOT_FOUND: (text: string) => generateError(`${text} not found`),
  INVALID: (text: string) => generateError(`invalid ${text}`),
  UNAVAILABLE: (text: string) => generateError(`${text} unavailable`),
};

const generateError = (message: string) => ({
  message: capitalizeFirstLetter(message.toLowerCase()),
  code: removeSpecialCharacters(message).replace(/ /g, '_').toUpperCase(), // 'Invalid user id!' => 'INVALID_USER_ID'
});

export const EXCEPTION = {
  // common
  BALANCE_NOT_ENOUGH: {
    code: 'BALANCE_NOT_ENOUGH',
    message: 'Balance not enough',
  },

  TOO_MANY_REQUEST: {
    code: 'TOO_MANY_REQUEST',
    message: 'Too many request',
  },

  INSURANCE: {
    BAD_SYMBOL: {
      code: 'BAD_SYMBOL',
      message: 'Bad symbol',
    },
    INVALID_QUANTITY: {
      code: 'INVALID_QUANTITY',
      message: 'Invalid quantity',
    },
    INVALID_P_LIMIT: {
      code: 'INVALID_P_LIMIT',
      message: 'Invalid price limit',
    },
    INVALID_MARGIN: {
      code: 'INVALID_MARGIN',
      message: 'Invalid margin',
    },
    INVALID_P_CLAIM: {
      code: 'INVALID_P_CLAIM',
      message: 'Invalid price claim',
    },
    INVALID_TIME: {
      code: 'INVALID_TIME',
      message: 'Invalid time',
    },
    INVALID_QUANTITY_ASSET: {
      code: 'INVALID_QUANTITY_ASSET',
      message: 'Invalid quantity asset',
    },
    INVALID_ASSET_COVER: {
      code: 'INVALID_ASSET_COVER',
      message: 'Invalid asset cover',
    },
    INVALID_PRICE_FILTER: {
      code: 'INVALID_PRICE_FILTER',
      message: 'Invalid price filter',
    },
    MAINTAINED: {
      code: 'MAINTAINED',
      message: 'Maintained',
    },
  },

  BINANCE: {
    INVALID_PERCENT_PRICE: {
      code: 'INVALID_PERCENT_PRICE',
      message: 'Invalid percent price',
    },
    INVALID_LOT_SIZE: {
      code: 'INVALID_LOT_SIZE',
      message: 'Invalid lot size',
    },
    INVALID_MIN_NOTIONAL: {
      code: 'INVALID_MIN_NOTIONAL',
      message: 'Invalid min notional',
    },
  },
};
