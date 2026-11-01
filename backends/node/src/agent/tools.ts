import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AggregateRequest, AggregateResponse } from '../semantic/aggregate-contract';
import type { SchemaResponse } from '../semantic/schema.service';
import { InvalidQueryError } from '../semantic/sales-model';
import type { ProductSummary, ResellerSummary } from '../catalog/catalog.controller';

/** What the tools call: the semantic layer and the catalogue in this process. */
export interface SalesData {
  aggregate(request: AggregateRequest): Promise<AggregateResponse>;
  products(search: string, limit: number): Promise<ProductSummary[]>;
  resellers(search: string, country: string | undefined, limit: number): Promise<ResellerSummary[]>;
}

const CHART_KINDS = ['bar', 'line', 'table', 'kpi'] as const;

/**
 * Builds the agent's tools from the semantic layer. Dimension and measure names become enums, so the
 * model sees exactly the names that exist. The semantic layer checks every request again; its error
 * message goes back to the model.
 */
export function createTools(schema: SchemaResponse, data: SalesData) {
  const dimensionNames = schema.dimensions.map((d) => d.name) as [string, ...string[]];
  const measureNames = schema.measures.map((m) => m.name) as [string, ...string[]];
  const { limits } = schema;

  const querySchema = z.object({
    measures: z.array(z.enum(measureNames)).min(1).describe('Measures to compute.'),
    groupBy: z
      .array(z.enum(dimensionNames))
      .max(limits.maxGroupBy)
      .optional()
      .describe(`Up to ${limits.maxGroupBy} dimensions to group by. Omit for a grand total.`),
    filters: z
      .array(
        z.object({
          dimension: z.enum(dimensionNames),
          operator: z.enum(['eq', 'in', 'gte', 'lte']).describe('eq and gte/lte take one value, in takes several.'),
          values: z.array(z.union([z.string(), z.number()])).min(1),
        }),
      )
      .max(limits.maxFilters)
      .optional()
      .describe('All filters must match. Text values must match the listed values exactly.'),
    orderBy: z
      .object({ field: z.string().describe('A requested dimension or measure.'), direction: z.enum(['asc', 'desc']).optional() })
      .optional()
      .describe('Default: largest first, time series chronologically.'),
    limit: z.number().int().min(1).max(limits.maxLimit).optional().describe(`Default ${limits.defaultLimit}.`),
  });

  const querySales = createTool({
    id: 'querySales',
    description: `
      Aggregates the sales data and shows the result to the user as a chart, table or key figure.
      The user sees the visualization right away, so do not repeat the numbers as a table in the answer;
      comment on what stands out instead.
      Put the measure the title is about first: charts plot the first measure, plus further
      measures with the same unit side by side when there is no second dimension.
      Choose the visualization: "line" for a time series (group by year, quarter or month),
      "bar" to compare categories, "kpi" for a single total without groupBy, "table" for three
      dimensions or long lists.
    `,
    inputSchema: z.object({
      title: z.string().describe('Short title for the visualization, e.g. "Revenue per year and channel".'),
      chart: z.enum(CHART_KINDS),
      query: querySchema,
    }),
    execute: ({ query }) => orError(() => data.aggregate(query)),
  });

  const findProducts = createTool({
    id: 'findProducts',
    description: `
      Searches the product catalogue by name and shows the products to the user as cards with photo.
      Use it when the user asks what a product looks like or which variants exist. To get sales
      figures of products, use querySales with the dimension "product".
    `,
    inputSchema: z.object({
      search: z.string().min(2).describe('Part of the product name, e.g. "Mountain-200" or "helmet".'),
      limit: z.number().int().min(1).max(24).optional().describe('Default 8.'),
    }),
    execute: ({ search, limit }) => orError(async () => ({ products: await data.products(search, limit ?? 8) })),
  });

  const findResellers = createTool({
    id: 'findResellers',
    description: `
      Looks up reseller companies by name and shows them to the user as cards: business type,
      location, number of employees, annual revenue and the year the shop opened. Use it when the
      user asks who a reseller is or where it is located. To get sales figures of resellers, use
      querySales with the dimension "reseller".
    `,
    inputSchema: z.object({
      search: z.string().min(2).describe('Part of the company name, e.g. "Brakes and Gears" or "bike".'),
      country: z.string().optional().describe('Only resellers in this country, e.g. "Germany".'),
      limit: z.number().int().min(1).max(12).optional().describe('Between 1 and 12. Default 6.'),
    }),
    execute: ({ search, country, limit }) => orError(async () => ({ resellers: await data.resellers(search, country, limit ?? 6) })),
  });

  return { querySales, findProducts, findResellers };
}

/**
 * Every failure becomes a tool result: the model can correct a rejected request or tell the user
 * that the database is unavailable, and the chat card shows the message instead of waiting.
 */
async function orError<T>(call: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof InvalidQueryError) return { error: error.message };
    console.error(error);
    return { error: 'The database is not reachable.' };
  }
}
