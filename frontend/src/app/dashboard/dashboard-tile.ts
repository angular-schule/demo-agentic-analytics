import { httpResource } from '@angular/common/http';
import { Component, input, output } from '@angular/core';
import { SalesChart } from '../charts/sales-chart';
import { AGGREGATE_URL, type AggregateResponse } from '../data/sales-api';
import type { DashboardTile as Tile } from './dashboard-store';

/** One pinned view. It asks the backend directly, so it costs no tokens and stays current. */
@Component({
  selector: 'app-dashboard-tile',
  imports: [SalesChart],
  template: `
    <app-sales-chart
      [title]="tile().title"
      [kind]="tile().chart"
      [result]="data.hasValue() ? data.value() : undefined"
      [message]="data.error() ? 'The backend could not answer this query.' : 'Loading …'"
    >
      <button type="button" class="remove" [attr.aria-label]="'Remove ' + tile().title" (click)="remove.emit()">×</button>
    </app-sales-chart>
  `,
  styles: `
    :host {
      display: block;
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
    .remove {
      flex: none;
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
    url: AGGREGATE_URL,
    method: 'POST',
    body: this.tile().query,
  }));
}
