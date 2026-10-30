import { z } from 'zod';

export const CHART_KINDS = ['bar', 'line', 'table', 'kpi'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

/**
 * A saved view: what to ask the data backend and how to show it. It is the argument of the agent's
 * querySales tool and the content of a dashboard tile, so a tile can be re-run without the model.
 */
export const salesViewSchema = z.object({
  title: z.string(),
  chart: z.enum(CHART_KINDS),
  query: z.object({
    measures: z.array(z.string()).min(1),
    groupBy: z.array(z.string()).optional(),
    filters: z
      .array(
        z.object({
          dimension: z.string(),
          operator: z.enum(['eq', 'in', 'gte', 'lte']),
          values: z.array(z.union([z.string(), z.number()])),
        }),
      )
      .optional(),
    orderBy: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']).optional() }).optional(),
    limit: z.number().optional(),
  }),
});

export type SalesView = z.infer<typeof salesViewSchema>;
