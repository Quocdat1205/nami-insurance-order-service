import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export enum INSURANCE_TYPE {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

export enum INSURANCE_STATE {
  AVAILABLE = 'Available',
  CLAIM_WAITING = 'Claim_waiting',
  CLAIMED = 'Claimed',
  REFUNDED = 'Refunded',
  LIQUIDATED = 'Liquidated',
  EXPIRED = 'Expired',
  CANCELED = 'Canceled',
  INVALID = 'Invalid',
}

export enum INSURANCE_SIDE {
  BULL = 'BULL', // LONG
  BEAR = 'BEAR', // SHORT
}

export enum PERIOD_TYPE {
  DAY = 'days',
  HOUR = 'hours',
}

export type InsuranceDocument = HydratedDocument<Insurance>;

@Schema({
  collection: 'insurance_offchain',
  timestamps: {
    currentTime: () => Date.now(),
  },
  autoIndex: true,
})
export class Insurance {
  @Prop({
    required: true,
    type: String,
  })
  _id: string;

  @Prop({
    required: true,
    trim: true,
  })
  owner: string;

  @Prop({
    required: true,
    trim: true,
  })
  nami_id: string;

  @Prop({
    enum: INSURANCE_TYPE,
  })
  type: INSURANCE_TYPE;

  @Prop({
    enum: INSURANCE_STATE,
  })
  state: INSURANCE_STATE;

  @Prop()
  margin: number;

  @Prop()
  q_covered: number;

  @Prop()
  q_claim: number;

  @Prop()
  expired: number;

  @Prop({
    trim: true,
    toString: true,
  })
  asset_covered: string;

  @Prop({
    trim: true,
    toString: true,
  })
  quote_asset: string;

  @Prop({
    required: true,
    trim: true,
  })
  asset_refund: string;

  @Prop({
    required: true,
  })
  p_market: number;

  @Prop({
    required: true,
  })
  p_claim: number;

  @Prop({
    required: true,
  })
  p_stop: number;

  @Prop({
    default: 0,
  })
  p_close: number;

  @Prop({
    required: true,
  })
  period: number;

  @Prop({
    default: 0,
  })
  pnl: number;

  @Prop({
    default: 0,
  })
  pnl_binance: number;

  @Prop({
    default: 0,
  })
  pnl_project: number;

  @Prop({
    trim: true,
    default: 'USDT',
  })
  unit: string;

  @Prop({
    required: true,
    trim: true,
    uppercase: true,
    enum: INSURANCE_SIDE,
  })
  side: INSURANCE_SIDE;

  @Prop({
    required: true,
    trim: true,
  })
  day_change_token: number;

  @Prop({
    default: 0,
  })
  volume_binance: number;

  @Prop({
    default: '',
  })
  type_state: string;

  @Prop({
    type: mongoose.Schema.Types.Mixed,
    default: [],
  })
  binance?: any;

  @Prop({
    default: 0,
  })
  origin_quantity: number;

  @Prop({
    default: Date.now(),
  })
  changed_time: number;

  @Prop({
    default: '',
  })
  futures_order_id?: string;

  @Prop({
    default: false,
  })
  payback?: boolean;

  @Prop({
    default: PERIOD_TYPE.DAY,
  })
  period_unit?: PERIOD_TYPE;

  @Prop()
  createdAt: number;
}

export const InsuranceSchema = SchemaFactory.createForClass(Insurance);
InsuranceSchema.index({ owner: 1, state: 1 }, { background: true });
