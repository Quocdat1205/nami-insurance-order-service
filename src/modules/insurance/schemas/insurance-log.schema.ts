import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import mongoose from 'mongoose';

export type InsuranceLogDocument = HydratedDocument<InsuranceLog>;

@Schema({
  collection: 'insuranceorderlogs',
  timestamps: { createdAt: true, updatedAt: true },
})
export class InsuranceLog {
  @Prop({ type: String, required: true })
  insuranceId: string;

  @Prop({ type: String })
  message?: string;

  @Prop({ type: [mongoose.Schema.Types.Mixed] })
  metadata: [
    {
      field: string;
      from: any;
      to: any;
    },
  ];
}

export const InsuranceLogSchema = SchemaFactory.createForClass(InsuranceLog);
