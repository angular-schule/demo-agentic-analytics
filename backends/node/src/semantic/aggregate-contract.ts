import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { LIMITS } from './sales-model';

const OPERATORS = ['eq', 'in', 'gte', 'lte'] as const;
const DIRECTIONS = ['asc', 'desc'] as const;

export class FilterRequest {
  @ApiProperty({ type: String, example: 'country' })
  @IsString()
  dimension!: string;

  @ApiProperty({ type: String, enum: OPERATORS, description: 'gte and lte only for numeric dimensions.' })
  @IsIn(OPERATORS)
  operator!: (typeof OPERATORS)[number];

  @ApiProperty({ type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'integer' }] }, example: ['Germany'] })
  @IsArray()
  @ArrayMinSize(1)
  values!: unknown[];
}

export class OrderByRequest {
  @ApiProperty({ type: String, example: 'revenue' })
  @IsString()
  field!: string;

  @ApiPropertyOptional({ type: String, enum: DIRECTIONS, nullable: true })
  @IsOptional()
  @IsIn(DIRECTIONS)
  direction?: (typeof DIRECTIONS)[number] | null;
}

/** Request body of POST /api/sales/aggregate. */
export class AggregateRequest {
  @ApiPropertyOptional({ type: [String], nullable: true, example: ['revenue'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  measures?: string[] | null;

  @ApiPropertyOptional({ type: [String], nullable: true, example: ['year', 'country'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupBy?: string[] | null;

  @ApiPropertyOptional({ type: [FilterRequest], nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterRequest)
  filters?: FilterRequest[] | null;

  @ApiPropertyOptional({ type: OrderByRequest, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderByRequest)
  orderBy?: OrderByRequest | null;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', nullable: true, minimum: 1, maximum: LIMITS.maxLimit, default: LIMITS.defaultLimit })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(LIMITS.maxLimit)
  limit?: number | null;
}

export class ColumnDescription {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, description: 'dimension or measure' })
  kind!: 'dimension' | 'measure';

  @ApiProperty({ type: String, nullable: true })
  unit!: string | null;
}

export class AggregateResponse {
  @ApiProperty({ type: [ColumnDescription] })
  columns!: ColumnDescription[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  rows!: Record<string, string | number | null>[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  rowCount!: number;

  @ApiProperty({ type: Boolean })
  truncated!: boolean;
}
