import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PeriodConfigDocument = HydratedDocument<PeriodConfig>;

@Schema({ collection: 'configperioddiffclaims' })
export class PeriodConfig {
  @Prop({ required: false, type: String })
  token: string;

  @Prop({ required: true, type: Array })
  list_ratio_change: number[];
}

export const PeriodConfigSchema = SchemaFactory.createForClass(PeriodConfig);
