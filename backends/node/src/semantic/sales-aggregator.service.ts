import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { sales } from '../db/analytics.schema';
import { DrizzleService } from '../db/drizzle.service';
import { AggregateRequest, AggregateResponse, ColumnDescription, FilterRequest, OrderByRequest } from './aggregate-contract';
import {
  DimensionDefinition,
  findDimension,
  findMeasures,
  InvalidQueryError,
  LIMITS,
  MeasureDefinition,
} from './sales-model';

/**
 * Turns an aggregate request into one Drizzle query over analytics.sales. Every column comes from
 * the semantic model, every value travels as a query parameter.
 */
@Injectable()
export class SalesAggregatorService {
  constructor(private readonly drizzle: DrizzleService) {}

  async aggregate(request: AggregateRequest): Promise<AggregateResponse> {
    const measures = findMeasures(request.measures ?? []);
    const groupBy = [...new Set(request.groupBy ?? [])];
    if (groupBy.length > LIMITS.maxGroupBy) {
      throw new InvalidQueryError(`Group by at most ${LIMITS.maxGroupBy} dimensions.`);
    }
    const dimensions = groupBy.map(findDimension);
    const filters = request.filters ?? [];
    if (filters.length > LIMITS.maxFilters) {
      throw new InvalidQueryError(`At most ${LIMITS.maxFilters} filters are allowed.`);
    }
    const limit = request.limit ?? LIMITS.defaultLimit;

    const selection: Record<string, PgColumn | SQL> = {};
    for (const dimension of dimensions) {
      selection[dimension.name] = dimension.column;
    }
    for (const measure of measures) {
      selection[measure.name] = measure.sql;
    }

    let query = this.drizzle.db
      .select(selection)
      .from(sales)
      .where(and(...filters.map(buildFilter)))
      .$dynamic();
    if (dimensions.length > 0) {
      query = query.groupBy(...dimensions.map((d) => d.column));
    }
    const rows = await query.orderBy(...buildOrder(request.orderBy, dimensions, measures)).limit(limit + 1);

    const result = rows.slice(0, limit) as AggregateResponse['rows'];
    return {
      columns: [
        ...dimensions.map((d): ColumnDescription => ({ name: d.name, kind: 'dimension', unit: null })),
        ...measures.map((m): ColumnDescription => ({ name: m.name, kind: 'measure', unit: m.unit })),
      ],
      rows: result,
      rowCount: result.length,
      truncated: rows.length > limit,
    };
  }
}

function buildFilter(filter: FilterRequest): SQL {
  const dimension = findDimension(filter.dimension);
  const read = (value: unknown) => readValue(dimension, value);
  const single = filter.values.length === 1 ? filter.values[0] : undefined;

  switch (filter.operator) {
    case 'eq':
      if (single !== undefined) return eq(dimension.column, read(single));
      break;
    case 'in':
      return inArray(dimension.column, filter.values.map(read));
    case 'gte':
      if (dimension.isNumeric && single !== undefined) return gte(dimension.column, read(single));
      break;
    case 'lte':
      if (dimension.isNumeric && single !== undefined) return lte(dimension.column, read(single));
      break;
  }
  throw new InvalidQueryError(
    `Operator '${filter.operator}' does not fit dimension '${dimension.name}'. Use eq (one value) or in (several values)` +
      (dimension.isNumeric ? ', or gte/lte (one value).' : '.'),
  );
}

function readValue(dimension: DimensionDefinition, value: unknown): string | number {
  if (dimension.isNumeric) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    throw new InvalidQueryError(`Dimension '${dimension.name}' expects whole numbers.`);
  }
  if (typeof value === 'string') return value;
  throw new InvalidQueryError(`Dimension '${dimension.name}' expects text values.`);
}

/**
 * NULLs sort first ascending and last descending, as in SQL Server, so both backends return rows in
 * the same order. Ties are broken by the grouping columns.
 */
function buildOrder(orderBy: OrderByRequest | null | undefined, dimensions: DimensionDefinition[], measures: MeasureDefinition[]): SQL[] {
  const direction = (expression: PgColumn | SQL, descending: boolean) =>
    descending ? sql`${expression} desc nulls last` : sql`${expression} asc nulls first`;
  const order: SQL[] = [];

  if (orderBy) {
    const descending = orderBy.direction === 'desc';
    const dimension = dimensions.find((d) => d.name === orderBy.field);
    const measure = measures.find((m) => m.name === orderBy.field);
    if (dimension) {
      order.push(direction(dimension.column, descending));
    } else if (measure) {
      order.push(direction(measure.sql, descending));
    } else {
      throw new InvalidQueryError(`orderBy.field '${orderBy.field}' must be one of the requested dimensions or measures.`);
    }
  } else if (!dimensions.some((d) => d.isTime) && measures[0]) {
    // Without a time dimension the largest groups come first; time series stay chronological.
    order.push(direction(measures[0].sql, true));
  }

  for (const dimension of dimensions) {
    order.push(direction(dimension.column, false));
  }
  return order;
}
