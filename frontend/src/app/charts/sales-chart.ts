import { Component, computed, input, signal } from '@angular/core';
import type { AggregateResponse } from '../data/sales-api';
import type { ChartKind } from '../data/sales-view';
import { BarChart } from './bar-chart';
import { resolveView } from './chart-model';
import { DataTable } from './data-table';
import { KpiTiles } from './kpi-tiles';
import { LineChart } from './line-chart';

/**
 * Shows an aggregate result in the requested form, with a legend for several series and a switch
 * to the table. Forms that do not fit the result (a stat tile for many rows) fall back to the table.
 * Without a result it shows the message instead. Projected content (such as a remove button) sits
 * at the end of the header.
 */
@Component({
  selector: 'app-sales-chart',
  imports: [BarChart, LineChart, KpiTiles, DataTable],
  template: `
    @let view = this.view();
    <header>
      <h3>{{ title() }}</h3>
      @if (view && view.kind !== 'table') {
        <div class="switch" role="group" aria-label="View">
          <button type="button" [class.on]="!showTable()" (click)="showTable.set(false)">Chart</button>
          <button type="button" [class.on]="showTable()" (click)="showTable.set(true)">Table</button>
        </div>
      }
      <ng-content />
    </header>

    @if (result(); as result) {
      @if (view?.kind === 'table' || showTable()) {
        <app-data-table [result]="result" />
      } @else if (view?.kind === 'kpi') {
        <app-kpi-tiles [result]="result" />
      } @else if (view && (view.kind === 'bar' || view.kind === 'line')) {
        <p class="caption">{{ view.chart.caption }}</p>
        @if (view.chart.series.length > 1) {
          <ul class="legend">
            @for (series of view.chart.series; track series.slot) {
              <li><i [style.background]="series.color"></i>{{ series.label }}</li>
            }
          </ul>
        }
        @if (view.kind === 'line') {
          <app-line-chart [chart]="view.chart" />
        } @else {
          <app-bar-chart [chart]="view.chart" />
        }
      }
      @if (result.truncated) {
        <p class="note">Showing the first {{ result.rowCount }} rows.</p>
      }
    } @else {
      <p class="note">{{ message() }}</p>
    }
  `,
  styleUrl: './sales-chart.css',
})
export class SalesChart {
  readonly title = input.required<string>();
  readonly result = input<AggregateResponse>();
  readonly kind = input.required<ChartKind>();
  readonly message = input('');

  protected readonly showTable = signal(false);

  protected readonly view = computed(() => {
    const result = this.result();
    return result ? resolveView(result, this.kind()) : null;
  });
}
