/**
 * The HTTP contract of the backend. The browser asks it directly, without the LLM:
 * dashboard tiles re-run their saved queries, product cards load their photos.
 */
export const AGGREGATE_URL = '/api/sales/aggregate';

export function photoUrl(productKey: number): string {
  return `/api/products/${productKey}/photo`;
}

export type CellValue = string | number | null;
export type ResultRow = Record<string, CellValue>;

export interface ResultColumn {
  name: string;
  kind: 'dimension' | 'measure';
  unit: string | null;
}

export interface AggregateResponse {
  columns: ResultColumn[];
  rows: ResultRow[];
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

export interface DataBackendHealth {
  backend: 'dotnet' | 'node';
  database: string;
  scope: string;
}

export interface AgentInfo {
  /** Mastra or Microsoft Agent Framework. */
  framework: string;
  model: string;
}
