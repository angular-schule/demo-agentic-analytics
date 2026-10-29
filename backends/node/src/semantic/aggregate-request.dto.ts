import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class FilterDto {
  @ApiProperty({ example: 'country' })
  @IsString()
  dimension!: string;

  @ApiProperty({ enum: ['eq', 'in', 'gte', 'lte'], description: 'gte and lte only for numeric dimensions.' })
  @IsIn(['eq', 'in', 'gte', 'lte'])
  operator!: 'eq' | 'in' | 'gte' | 'lte';

  @ApiProperty({ type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'integer' }] }, example: ['Germany'] })
  @IsArray()
  @ArrayMinSize(1)
  values!: unknown[];
}

export class OrderByDto {
  @ApiProperty({ example: 'revenue' })
  @IsString()
  field!: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: 'asc' | 'desc';
}

/** Request body of POST /api/sales/aggregate. */
export class AggregateRequestDto {
  @ApiProperty({ type: [String], example: ['revenue'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  measures!: string[];

  @ApiPropertyOptional({ type: [String], example: ['year', 'country'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupBy?: string[];

  @ApiPropertyOptional({ type: [FilterDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterDto)
  filters?: FilterDto[];

  @ApiPropertyOptional({ type: OrderByDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderByDto)
  orderBy?: OrderByDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}
