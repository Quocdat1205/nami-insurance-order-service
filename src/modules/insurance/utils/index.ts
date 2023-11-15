import {
  INSURANCE_SIDE,
  PERIOD_TYPE,
} from '@modules/insurance/schemas/insurance.schema';
import Big from 'big.js';
import {
  CHANGE_AVG,
  DEFAULT_DECIMAL,
  FUTURES_STOP_DIFF,
  HOUR_Q_CLAIM_CONFIG,
  MAX_HEDGE_RATIO,
  MAX_Q_COVER,
  MIN_HEDGE_RATIO,
  MIN_MARGIN,
  MIN_Q_COVER,
  PRICE_CLAIM_DIFFERENT_RATIO,
  Q_CLAIM_CONFIG,
  RISK_CONFIG,
} from '@modules/insurance/constants';
import { EXCEPTION } from '@commons/constants/exception';
import { BadRequestException } from '@nestjs/common';

export const validateMargin = (
  currentPrice: number,
  payload: {
    asset_covered: string;
    p_open: number;
    margin: number;
    q_covered: number;
    unit: string;
  },
) => {
  const { margin, p_open, q_covered } = payload;
  try {
    // validate margin and q_covered
    if (
      Big(margin).lt(MIN_MARGIN) ||
      Big(q_covered).lt(MIN_Q_COVER) ||
      Big(q_covered).gte(MAX_Q_COVER)
    ) {
      throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_QUANTITY);
    }
    if (!currentPrice || currentPrice === 0) {
      throw new BadRequestException(EXCEPTION.INSURANCE.BAD_SYMBOL);
    }
    // validate price
    if (
      Big(p_open)
        .minus(currentPrice)
        .abs()
        .div(p_open)
        // .gt(PRICE_CLAIM_DIFFERENT_RATIO)
        .gt(1)
    ) {
      throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_P_LIMIT);
    }
    // validate margin
    const ratio_margin_q_cover = Number(
      Big(margin).div(q_covered).toFixed(DEFAULT_DECIMAL),
    ); // margin unit == q_cover unit = USDT
    if (
      ratio_margin_q_cover < MIN_HEDGE_RATIO ||
      ratio_margin_q_cover > MAX_HEDGE_RATIO
    ) {
      throw new BadRequestException(EXCEPTION.INSURANCE.INVALID_MARGIN);
    }

    return {
      isValid: true,
      p_market: currentPrice,
    };
  } catch (error) {
    throw error;
  }
};

export const calculateInsuranceStat = (payload: {
  period: number;
  margin: number;
  q_covered: number;
  p_open: number;
  p_claim: number;
  day_change_token: number;
  period_unit: PERIOD_TYPE;
}) => {
  const {
    period,
    margin,
    q_covered,
    p_open,
    p_claim,
    day_change_token,
    period_unit,
  } = payload;

  let cal_expired: Date;

  if (period_unit === PERIOD_TYPE.DAY) {
    cal_expired = new Date(
      new Date().getTime() +
        parseInt(period as unknown as string) * 60 * 60 * 1000 * 24,
    );
  } else {
    cal_expired = new Date(
      new Date().getTime() +
        parseInt(period as unknown as string) * 60 * 60 * 1000,
    );
  }
  const expired = new Date(cal_expired).getTime();

  const hedge = Number(Big(margin).div(q_covered));
  const p_stop = calculatePStop({
    p_open,
    p_claim,
    hedge,
  });
  const q_claim = calculateQClaim({
    margin,
    p_open,
    p_claim,
    hedge,
    day_change_token,
    period,
    period_unit,
  });

  const side_insurance =
    p_open < p_claim ? INSURANCE_SIDE.BULL : INSURANCE_SIDE.BEAR;

  return {
    expired,
    hedge,
    p_stop,
    side_insurance,
    q_claim,
  };
};

export const calculatePStop = (props: {
  p_open: number;
  p_claim: number;
  hedge: number;
}): number => {
  const { p_open, p_claim, hedge } = props;
  const ratio_min_profit = Math.abs(p_claim - p_open) / p_open / 2;

  let p_stop: number;

  if (p_claim > p_open) {
    p_stop = Number(
      Big(p_open)
        .minus(
          Big(p_open).times(
            Big(hedge).plus(ratio_min_profit).minus(FUTURES_STOP_DIFF),
          ),
        )
        .toFixed(DEFAULT_DECIMAL),
    );
  } else {
    p_stop = Number(
      Big(p_open)
        .plus(
          Big(p_open).times(
            Big(hedge).plus(ratio_min_profit).minus(FUTURES_STOP_DIFF),
          ),
        )
        .toFixed(DEFAULT_DECIMAL),
    );
  }

  return p_stop;
};

export const calculateQClaim = (payload: {
  margin: number;
  p_open: number;
  p_claim: number;
  hedge: number;
  day_change_token: number;
  period: number;
  period_unit: PERIOD_TYPE;
}) => {
  const {
    margin,
    p_open,
    p_claim,
    hedge,
    day_change_token,
    period,
    period_unit,
  } = payload;
  const p_stop = calculatePStop({ p_open, p_claim, hedge });
  const leverage = Math.floor(p_open / Math.abs(p_open - p_stop));
  // const ratioPredict = Math.abs(p_claim - p_open) / p_open;
  const ratioPredict = Number(Big(p_claim).minus(p_open).abs().div(p_open));
  const userCapital = margin;
  const system_risk = calculateSystemRisk({ p_stop, p_open, day_change_token });
  const system_capital = calculateSystemCapital({ margin, system_risk });
  const hedgeCapital = Number(Big(userCapital).add(system_capital));
  const profit = Number(Big(ratioPredict).times(hedgeCapital).times(leverage));
  const diffClaim = calculateClaimDiff(day_change_token);
  let q_claim: number;

  const ratio = (
    period_unit === PERIOD_TYPE.HOUR ? Q_CLAIM_CONFIG : HOUR_Q_CLAIM_CONFIG
  ).reduce((prev, curr) => {
    const currHedge = Big(curr.hedge).minus(hedge).abs();
    const prevHedge = Big(prev.hedge).minus(hedge).abs();
    return Big(currHedge).lt(prevHedge) ? curr : prev;
  });

  if (period < 2) {
    q_claim = Number(
      Big(profit)
        .times(Big(1).minus(diffClaim))
        .times(Big(1).minus(ratio.x))
        .plus(margin)
        .toFixed(DEFAULT_DECIMAL),
    );
  } else {
    q_claim = Number(
      Big(profit)
        .times(Big(1).minus(diffClaim))
        .plus(margin)
        .toFixed(DEFAULT_DECIMAL),
    );
  }

  return q_claim;
};

export const calculateSystemRisk = (props: {
  p_stop: number;
  p_open: number;
  day_change_token: number;
}) => {
  const { p_stop, p_open, day_change_token } = props;
  const percent_p_expired = Number(
    Big(p_stop).minus(p_open).abs().div(p_open).toFixed(DEFAULT_DECIMAL),
  );
  return Number(
    Big(day_change_token).div(percent_p_expired).toFixed(DEFAULT_DECIMAL),
  );
};

export const calculateSystemCapital = ({ margin, system_risk }) => {
  if (system_risk > RISK_CONFIG) {
    return Number(
      Big(margin).times(RISK_CONFIG).div(system_risk).toFixed(DEFAULT_DECIMAL),
    );
  } else {
    return Number(
      Big(margin)
        .plus(Big(RISK_CONFIG).minus(system_risk).times(margin))
        .toFixed(DEFAULT_DECIMAL),
    );
  }
};

export const calculateClaimDiff = (day_change_avg: number | string) => {
  return parseFloat(`${day_change_avg}`) <= CHANGE_AVG ? 0.3 : 0.27;
};

export const calculateFuturesBnbQuantity = (props: {
  margin: number;
  p_open: number;
  p_claim: number;
  hedge: number;
  day_change_token: number;
}) => {
  const { p_open, p_claim, hedge, margin, day_change_token } = props;

  const p_stop = calculatePStop({ p_open, p_claim, hedge });
  const leverage = Math.floor(
    Number(Big(p_open).div(Big(p_open).minus(p_stop).abs())),
  );
  const user_capital = margin;
  const system_risk = calculateSystemRisk({ p_stop, p_open, day_change_token });
  const system_capital = calculateSystemCapital({ margin, system_risk });
  const hedge_capital = Number(Big(user_capital).add(system_capital));
  const qty = Number(Big(hedge_capital).times(leverage).div(p_open));

  return qty;
};

export const symbolFilter = (
  filter: any,
  type: number,
  value: number,
  markPrice?: number,
) => {
  filter.multiplierDown = Number(filter.multiplierDown);
  filter.multiplierUp = Number(filter.multiplierUp);
  filter.multiplierDecimal = Number(filter.multiplierDecimal);
  const result = {
    isValid: true,
    data: {
      message: 'ok',
      description: '',
    },
  };
  switch (type) {
    case 0: // PRICE_FILTER
      result.isValid = false;
      result.data.message = EXCEPTION.INSURANCE.INVALID_PRICE_FILTER.message;
      if (
        Number(filter.minPrice) <= value &&
        value <= Number(filter.maxPrice)
      ) {
        // const x = exactMath.sub(value, filter.minPrice);
        const x = Number(
          Big(value).minus(filter.minPrice).toFixed(DEFAULT_DECIMAL),
        );
        const y = +filter.tickSize;
        // const filterModulus = this.subNumber(x, y);
        const filterModulus = Number(Big(x).mod(y).toFixed(DEFAULT_DECIMAL));
        if (filterModulus !== 0) {
          result.data.description = `:(price-minPrice) % tickSize != 0`;
        }
      } else {
        result.data.description = ` not in [${filter.minPrice}, ${filter.maxPrice}]`;
      }
      break;
    case 6: // PERCENT_PRICE
      const valueMax = Number(
        Big(markPrice)
          .times(filter.multiplierUp)
          .toFixed(filter.multiplierDecimal),
      );
      const valueMin = Number(
        Big(markPrice)
          .times(filter.multiplierDown)
          .toFixed(filter.multiplierDecimal ?? DEFAULT_DECIMAL),
      );
      if (value > valueMax || value < valueMin) {
        result.isValid = false;
        result.data.message = EXCEPTION.BINANCE.INVALID_PERCENT_PRICE.message;
        result.data.description = ` = ${value} not in [markPrice*multiplierDown, markPrice*multiplierUp]
         ~ [${valueMin}, ${valueMax}]`;
      }
      break;
    case 1: // LOT_SIZE
      if (+filter.minQty <= value && value <= +filter.maxQty) {
        const x = Number(
          Big(value).minus(filter.minQty).toFixed(DEFAULT_DECIMAL),
        );
        const y = +filter.stepSize;
        const filterModulus = Number(Big(x).mod(y).toFixed(DEFAULT_DECIMAL));

        result.isValid = false;
        result.data.message = EXCEPTION.BINANCE.INVALID_LOT_SIZE.message;

        if (filterModulus !== 0) {
          result.data.description = ` :(quantity-minQty) % tickSize != 0`;
        }
      } else {
        result.data.description = ` not in [${filter.minQty}, ${filter.maxQty}]`;
      }
      break;
    case 5: // MIN_NOTIONAL
      if (value < filter.notional) {
        result.isValid = false;
        result.data.message = EXCEPTION.BINANCE.INVALID_MIN_NOTIONAL.message;
        result.data.description = ` (= ${value}) not >= ${filter.notional}`;
      }
      break;
    default:
      break;
  }
  return result;
};
