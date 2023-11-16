import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OnchainHistoryDocument = HydratedDocument<OnchainHistory>;

@Schema({ collection: 'historyonchains' })
export class OnchainHistory {
  @Prop({ required: true })
  insurance_id: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  asset_cover: string;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  side: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  type: string;
}

export const OnchainHistorySchema =
  SchemaFactory.createForClass(OnchainHistory);
