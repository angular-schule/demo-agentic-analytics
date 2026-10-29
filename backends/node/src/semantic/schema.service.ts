import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, isNotNull, max, min } from 'drizzle-orm';
import { sales } from '../db/analytics.schema';
import { DrizzleService } from '../db/drizzle.service';
import { EnvironmentVariables } from '../env.config';
import { DIMENSIONS, LIMITS, MEASURES } from './sales-model';

/**
 * Describes the semantic layer for the language model: which dimensions and measures exist, and for
 * small dimensions the exact values, so filters can use them verbatim.
 */
@Injectable()
export class SchemaService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async get() {
    const db = this.drizzle.db;
    const dimensions = [];
    for (const dimension of DIMENSIONS) {
      const values = dimension.listValues
        ? (
            await db
              .selectDistinct({ value: dimension.column })
              .from(sales)
              .where(isNotNull(dimension.column))
              .orderBy(asc(dimension.column))
          ).map((row) => row.value)
        : null;
      dimensions.push({
        name: dimension.name,
        label: dimension.label,
        description: dimension.description,
        type: dimension.isNumeric ? 'integer' : 'string',
        values,
      });
    }

    const [period] = await db.select({ from: min(sales.orderDate), to: max(sales.orderDate) }).from(sales);

    return {
      dataset: {
        name: 'AdventureWorks sales',
        description:
          'Order lines of a fictitious bicycle manufacturer, sold online to consumers and through resellers. Contains no data about natural persons.',
        currency: 'USD',
        from: period?.from ?? null,
        to: period?.to ?? null,
        scope: this.config.get('DATA_SCOPE', { infer: true }),
      },
      dimensions,
      measures: MEASURES,
      limits: LIMITS,
    };
  }
}
