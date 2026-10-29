import { PgColumn } from 'drizzle-orm/pg-core';
import { sales } from '../db/analytics.schema';

/** A column the caller may group and filter by. */
export interface DimensionDefinition {
  name: string;
  label: string;
  description: string;
  isNumeric: boolean;
  /** Whether /api/schema lists the distinct values (only for small sets). */
  listValues: boolean;
  column: PgColumn;
}

/** An aggregate the caller may request. */
export interface MeasureDefinition {
  name: MeasureName;
  label: string;
  description: string;
  unit: string | null;
}

export const MEASURE_NAMES = ['revenue', 'cost', 'margin', 'quantity', 'orders'] as const;
export type MeasureName = (typeof MEASURE_NAMES)[number];

/**
 * The semantic layer over analytics.sales: the complete list of dimensions and measures a caller
 * (in the end, a language model) may use. Names outside these lists are rejected, so no request
 * can reach a column that is not listed here.
 */
export const DIMENSIONS: readonly DimensionDefinition[] = [
  { name: 'year', label: 'Order year', description: 'Calendar year of the order date.', isNumeric: true, listValues: true, column: sales.orderYear },
  { name: 'quarter', label: 'Order quarter', description: 'Calendar quarter of the order date (1 to 4).', isNumeric: true, listValues: true, column: sales.orderQuarter },
  { name: 'month', label: 'Order month', description: 'Calendar month of the order date (1 to 12).', isNumeric: true, listValues: true, column: sales.orderMonth },
  { name: 'channel', label: 'Sales channel', description: "'Online' for direct sales to consumers, 'Reseller' for sales to bike shops and other companies.", isNumeric: false, listValues: true, column: sales.channel },
  { name: 'productCategory', label: 'Product category', description: 'Top-level product category.', isNumeric: false, listValues: true, column: sales.productCategory },
  { name: 'productSubcategory', label: 'Product subcategory', description: "Product subcategory, e.g. 'Mountain Bikes'.", isNumeric: false, listValues: true, column: sales.productSubcategory },
  { name: 'product', label: 'Product', description: 'Product name including size and colour variant.', isNumeric: false, listValues: false, column: sales.productName },
  { name: 'territoryGroup', label: 'Territory group', description: 'Sales territory group (continent level).', isNumeric: false, listValues: true, column: sales.salesTerritoryGroup },
  { name: 'country', label: 'Country', description: 'Country of the sales territory.', isNumeric: false, listValues: true, column: sales.salesTerritoryCountry },
  { name: 'region', label: 'Region', description: 'Sales territory region. The United States is split into five regions, every other country is one region.', isNumeric: false, listValues: true, column: sales.salesTerritoryRegion },
  { name: 'reseller', label: 'Reseller', description: 'Name of the reseller company. Empty for online sales.', isNumeric: false, listValues: false, column: sales.resellerName },
  { name: 'resellerBusinessType', label: 'Reseller business type', description: 'Kind of reseller. Empty for online sales.', isNumeric: false, listValues: true, column: sales.resellerBusinessType },
];

export const MEASURES: readonly MeasureDefinition[] = [
  { name: 'revenue', label: 'Revenue', description: 'Sum of the sales amount.', unit: 'USD' },
  { name: 'cost', label: 'Product cost', description: 'Sum of the standard cost of the products sold.', unit: 'USD' },
  { name: 'margin', label: 'Gross margin', description: 'Revenue minus product cost.', unit: 'USD' },
  { name: 'quantity', label: 'Units sold', description: 'Number of units sold.', unit: null },
  { name: 'orders', label: 'Orders', description: 'Number of distinct sales orders.', unit: null },
];

export const LIMITS = { maxGroupBy: 3, maxFilters: 10, defaultLimit: 100, maxLimit: 1000 } as const;

/** A request that does not fit the semantic layer. The message names the allowed values. */
export class InvalidQueryError extends Error {}

export function findDimension(name: string): DimensionDefinition {
  const dimension = DIMENSIONS.find((d) => d.name === name);
  if (!dimension) {
    throw new InvalidQueryError(`Unknown dimension '${name}'. Allowed: ${DIMENSIONS.map((d) => d.name).join(', ')}.`);
  }
  return dimension;
}

export function findMeasure(name: string): MeasureDefinition {
  const measure = MEASURES.find((m) => m.name === name);
  if (!measure) {
    throw new InvalidQueryError(`Unknown measure '${name}'. Allowed: ${MEASURES.map((m) => m.name).join(', ')}.`);
  }
  return measure;
}
