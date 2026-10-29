import { httpResource } from '@angular/common/http';
import { Component, input, output } from '@angular/core';
import { SalesChart } from '../charts/sales-chart';
import type { AggregateResponse } from '../data/sales-api';
import type { DashboardTile as Tile } from './dashboard-store';

/** One pinned view. It asks the data backend directly, so it costs no tokens and stays current. */
@Component({
  selector: 'app-dashboard-tile',
  imports: [SalesChart],
  template: `
    @if (data.hasValue()) {
      <app-sales-chart [title]="tile().title" [kind]="tile().chart" [result]="data.value()" />
    } @else if (data.error()) {
      <h3>{{ tile().title }}</h3>
      <p class="hint">The data backend could not answer this query.</p>
    } @else {
      <h3>{{ tile().title }}</h3>
      <p class="hint">Loading …</p>
    }
    <button type="button" class="remove" [attr.aria-label]="'Remove ' + tile().title" (click)="remove.emit()">×</button>
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      align-content: start;
      gap: 0.75rem;
      min-width: 0;
      padding: 1rem 1rem 1.1rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      box-shadow: var(--shadow-sm);
    }
    :host:has(.remove:hover) {
      border-color: var(--border-strong);
    }
    app-sales-chart {
      padding-right: 1.75rem;
    }
    h3 {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
    }
    .hint {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    .remove {
      position: absolute;
      top: 0.7rem;
      right: 0.6rem;
      width: 1.6rem;
      height: 1.6rem;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }
    .remove:hover {
      background: var(--surface-2);
      color: var(--text-primary);
    }
  `,
})
export class DashboardTile {
  readonly tile = input.required<Tile>();
  readonly remove = output();

  protected readonly data = httpResource<AggregateResponse>(() => ({
    url: '/api/sales/aggregate',
    method: 'POST',
    body: this.tile().query,
  }));
}
