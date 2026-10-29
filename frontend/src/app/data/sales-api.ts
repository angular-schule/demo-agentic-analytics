import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type CellValue = string | number | null;

/** The request of the semantic layer. Names are checked by the data backend. */
export interface AggregateRequest {
  measures: string[];
  groupBy?: string[];
  filters?: { dimension: string; operator: 'eq' | 'in' | 'gte' | 'lte'; values: (string | number)[] }[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

export interface ResultColumn {
  name: string;
  kind: 'dimension' | 'measure';
  unit: string | null;
}

export interface AggregateResponse {
  columns: ResultColumn[];
  rows: Record<string, CellValue>[];
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
  agentId: string;
  model: string;
  scope: string;
}

/**
 * Direct access to the data backend, without the language model: the dashboard re-runs saved
 * queries here, and product photos load from here.
 */
@Injectable({ providedIn: 'root' })
export class SalesApi {
  private readonly http = inject(HttpClient);

  aggregate(request: AggregateRequest): Observable<AggregateResponse> {
    return this.http.post<AggregateResponse>('/api/sales/aggregate', request);
  }

  photoUrl(productKey: number): string {
    return `/api/products/${productKey}/photo`;
  }
}
