import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty } from '@nestjs/swagger';
import { asc, isNotNull, max, min } from 'drizzle-orm';
import { sales } from '../db/analytics.schema';
import { DrizzleService } from '../db/drizzle.service';
import { EnvironmentVariables } from '../env.config';
import { DIMENSIONS, LIMITS, MEASURES } from './sales-model';

export class DimensionInfo {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: String, description: 'integer or string' }) type!: string;
  @ApiProperty({ type: 'array', nullable: true }) values!: (string | number)[] | null;
}

export class MeasureInfo {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: String, nullable: true }) unit!: string | null;
}

export class DatasetInfo {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ type: String, format: 'date' }) from!: string;
  @ApiProperty({ type: String, format: 'date' }) to!: string;
  @ApiProperty({ type: String }) scope!: string;
}

export class QueryLimits {
  @ApiProperty({ type: 'integer', format: 'int32' }) maxGroupBy!: number;
  @ApiProperty({ type: 'integer', format: 'int32' }) maxFilters!: number;
  @ApiProperty({ type: 'integer', format: 'int32' }) defaultLimit!: number;
  @ApiProperty({ type: 'integer', format: 'int32' }) maxLimit!: number;
}

export class SchemaResponse {
  @ApiProperty({ type: DatasetInfo }) dataset!: DatasetInfo;
  @ApiProperty({ type: [DimensionInfo] }) dimensions!: DimensionInfo[];
  @ApiProperty({ type: [MeasureInfo] }) measures!: MeasureInfo[];
  @ApiProperty({ type: QueryLimits }) limits!: QueryLimits;
}

/**
 * Describes the semantic layer for the LLM: which dimensions and measures exist, and for
 * small dimensions the exact values, so filters can use them verbatim.
 */
@Injectable()
export class SchemaService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  private schema?: Promise<SchemaResponse>;

  /** The data does not change while the backend runs, so the schema is built once. */
  get(): Promise<SchemaResponse> {
    this.schema ??= this.load().catch((error: unknown) => {
      this.schema = undefined;
      throw error;
    });
    return this.schema;
  }

  private async load(): Promise<SchemaResponse> {
    const db = this.drizzle.db;
    const [dimensions, [period]] = await Promise.all([
      Promise.all(
        DIMENSIONS.map(async (dimension) => ({
          name: dimension.name,
          label: dimension.label,
          description: dimension.description,
          type: dimension.isNumeric ? 'integer' : 'string',
          values: dimension.listValues
            ? (
                await db
                  .selectDistinct({ value: dimension.column })
                  .from(sales)
                  .where(isNotNull(dimension.column))
                  .orderBy(asc(dimension.column))
              ).map((row) => row.value)
            : null,
        })),
      ),
      db.select({ from: min(sales.orderDate), to: max(sales.orderDate) }).from(sales),
    ]);

    return {
      dataset: {
        name: 'AdventureWorks sales',
        description:
          'Order lines of a fictitious bicycle manufacturer, sold online to consumers and through resellers. Contains no data about natural persons.',
        currency: 'USD',
        // Without rows (a territory scope without sales) both backends report the smallest date.
        from: period?.from ?? '0001-01-01',
        to: period?.to ?? '0001-01-01',
        scope: this.config.get('DATA_SCOPE', { infer: true }),
      },
      dimensions,
      measures: MEASURES.map(({ name, label, description, unit }) => ({ name, label, description, unit })),
      limits: LIMITS,
    };
  }
}
