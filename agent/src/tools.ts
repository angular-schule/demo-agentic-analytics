import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { DataApiError, dataApi, type SalesSchema } from './data-api.ts';

const CHART_KINDS = ['bar', 'line', 'table', 'kpi'] as const;

/**
 * Builds the agent's tools from the semantic layer the backend publishes. Dimension and
 * measure names become enums, so the model sees exactly the names that exist. The backend checks
 * every request again; its error message goes back to the model.
 */
export function createTools(schema: SalesSchema) {
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
    execute: ({ query }) => orError(() => dataApi.aggregate(query)),
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
    execute: ({ search, limit }) => orError(async () => ({ products: await dataApi.products(search, limit ?? 8) })),
  });

  return { querySales, findProducts };
}

/**
 * Every failure becomes a tool result: the model can correct a rejected request or tell the user
 * that the backend is unavailable, and the chat card shows the message instead of waiting.
 */
async function orError<T>(call: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof DataApiError) return { error: error.message };
    if (error instanceof DOMException && error.name === 'TimeoutError') return { error: 'The backend did not answer in time.' };
    console.error(error);
    return { error: 'The backend is not reachable.' };
  }
}
