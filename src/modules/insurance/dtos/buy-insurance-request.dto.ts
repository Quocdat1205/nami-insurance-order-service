import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import {
  INSURANCE_TYPE,
  PERIOD_TYPE,
} from '@modules/insurance/schemas/insurance.schema';

export class BuyInsuranceRequestDTO {
  @IsNotEmpty()
  @IsEnum(INSURANCE_TYPE, { each: true })
  @Type(() => String)
  type: INSURANCE_TYPE;

  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  asset_covered: string;

  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  asset_refund: string;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  margin: number;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  q_covered: number;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  p_open: number;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  p_claim: number;

  @Type(() => Number)
  @IsNotEmpty()
  @IsPositive()
  period: number;

  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  unit: string;

  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  quote_asset: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  day_change_token: number;

  @IsOptional()
  @IsString()
  futures_order_id: string;

  @IsOptional()
  @IsString()
  ref?: string;

  @IsNotEmpty()
  @IsEnum(PERIOD_TYPE, { each: true })
  @Type(() => String)
  period_unit: PERIOD_TYPE;
}
