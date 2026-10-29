import { DATA_API_URL } from './config.ts';

export interface DimensionInfo {
  name: string;
  label: string;
  description: string;
  type: 'integer' | 'string';
  values: (string | number)[] | null;
}

export interface MeasureInfo {
  name: string;
  label: string;
  description: string;
  unit: string | null;
}

export interface SalesSchema {
  dataset: { name: string; description: string; currency: string; from: string | null; to: string | null; scope: string };
  dimensions: DimensionInfo[];
  measures: MeasureInfo[];
  limits: { maxGroupBy: number; maxFilters: number; defaultLimit: number; maxLimit: number };
}

export interface AggregateRequest {
  measures: string[];
  groupBy?: string[];
  filters?: { dimension: string; operator: 'eq' | 'in' | 'gte' | 'lte'; values: (string | number)[] }[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

export interface AggregateResponse {
  columns: { name: string; kind: 'dimension' | 'measure'; unit: string | null }[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
  truncated: boolean;
}

export interface ProductSummary {
  productKey: number;
  productName: string;
  productSubcategory: string | null;
  productCategory: string | null;
  color: string | null;
  listPrice: number | null;
  hasPhoto: boolean;
}

/**
 * A request the data backend rejected. The message is the problem detail, which names the allowed
 * values, so the model can correct its next call.
 */
export class DataApiError extends Error {}

const TIMEOUT_MS = 30_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(DATA_API_URL + path, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { title?: string; detail?: string } | null;
    throw new DataApiError(problem?.detail ?? problem?.title ?? `Data API answered ${response.status}.`);
  }
  return (await response.json()) as T;
}

export const dataApi = {
  schema: () => call<SalesSchema>('/api/schema'),
  aggregate: (request: AggregateRequest) =>
    call<AggregateResponse>('/api/sales/aggregate', { method: 'POST', body: JSON.stringify(request) }),
  products: (search: string, limit: number) =>
    call<ProductSummary[]>(`/api/products?${new URLSearchParams({ search, limit: String(limit) })}`),
};
