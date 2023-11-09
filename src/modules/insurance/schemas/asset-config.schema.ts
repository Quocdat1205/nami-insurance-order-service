import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AssetConfigDocument = HydratedDocument<AssetConfig>;

@Schema({ collection: 'configassets' })
export class AssetConfig {
  @Prop({ required: true, type: String, index: true })
  symbol: string; //BTCUSDT

  @Prop({ required: true, type: String })
  pair: string; //BTCUSDT

  @Prop({ required: true, type: String })
  contractType: string; //PERPETUAL

  @Prop({ required: true, type: Date })
  deliveryDate: Date; //4133404802000

  @Prop({ required: true, type: Date })
  onboardDate: Date; // 1569398400000

  @Prop({ required: true, type: String })
  status: string; //TRADING

  @Prop({ required: true, type: Number })
  maintMarginPercent: number; //2.5000

  @Prop({ required: true, type: Number })
  requiredMarginPercent: number; //5.0000

  @Prop({ required: true, type: String })
  baseAsset: string; //BTC

  @Prop({ required: true, type: String })
  quoteAsset: string; //USDT

  @Prop({ required: true, type: String })
  marginAsset: string; //USDT

  @Prop({ required: true, type: Number })
  pricePrecision: number; //2

  @Prop({ required: true, type: Number })
  quantityPrecision: number; //3

  @Prop({ required: true, type: Number })
  baseAssetPrecision: number; //8

  @Prop({ required: true, type: Number })
  quotePrecision: number; //8

  @Prop({ required: true, type: String })
  underlyingType: string; //COIN

  @Prop({ required: true, type: Array })
  underlyingSubType: Array<string>; // []

  @Prop({ required: true, type: Number })
  settlePlan: number; //0

  @Prop({ required: true, type: Number })
  triggerProtect: number; //0.0500

  @Prop({ required: true, type: Number })
  liquidationFee: number; //0.020000

  @Prop({ required: true, type: Number })
  marketTakeBound: number; //0.30

  @Prop({ required: true, type: Array })
  filters: Array<any>;

  @Prop({ required: false })
  orderTypes: Array<string>; // ['LIMIT', 'MARKET', ...]

  @Prop({ required: false, type: Array })
  timeInForce: Array<string>; // [ 'GTC', 'IOC', 'FOK', 'GTX' ]

  @Prop({ required: false, default: false, type: Boolean })
  isMaintain?: boolean;

  @Prop({ required: false, default: false, type: Boolean })
  isMaxQty?: boolean;
}

export const AssetConfigSchema = SchemaFactory.createForClass(AssetConfig);
