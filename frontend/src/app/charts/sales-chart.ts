import { Component, computed, input, signal } from '@angular/core';
import type { AggregateResponse } from '../data/sales-api';
import type { ChartKind } from '../data/sales-view';
import { BarChart } from './bar-chart';
import { toCategoryChart } from './chart-model';
import { DataTable } from './data-table';
import { KpiTiles } from './kpi-tiles';
import { LineChart } from './line-chart';

/**
 * Shows an aggregate result in the requested form, with a legend for several series and a switch
 * to the table. Forms that do not fit the result (a stat tile for many rows) fall back to the table.
 */
@Component({
  selector: 'app-sales-chart',
  imports: [BarChart, LineChart, KpiTiles, DataTable],
  template: `
    @let chart = this.chart();
    <header>
      <h3>{{ title() }}</h3>
      @if (canChart()) {
        <div class="switch" role="group" aria-label="View">
          <button type="button" [class.on]="!showTable()" (click)="showTable.set(false)">Chart</button>
          <button type="button" [class.on]="showTable()" (click)="showTable.set(true)">Table</button>
        </div>
      }
    </header>

    @if (showTable() || !canChart()) {
      <app-data-table [result]="result()" />
    } @else if (kind() === 'kpi') {
      <app-kpi-tiles [result]="result()" />
    } @else if (chart) {
      <p class="caption">{{ chart.caption }}</p>
      @if (chart.series.length > 1) {
        <ul class="legend">
          @for (series of chart.series; track series.slot) {
            <li><i [style.background]="'var(--series-' + series.slot + ')'"></i>{{ series.label }}</li>
          }
        </ul>
      }
      @if (kind() === 'line') {
        <app-line-chart [chart]="chart" />
      } @else {
        <app-bar-chart [chart]="chart" />
      }
    }

    @if (result().truncated) {
      <p class="note">Showing the first {{ result().rowCount }} rows.</p>
    }
  `,
  styleUrl: './sales-chart.css',
})
export class SalesChart {
  readonly title = input.required<string>();
  readonly result = input.required<AggregateResponse>();
  readonly kind = input.required<ChartKind>();

  protected readonly showTable = signal(false);

  protected readonly chart = computed(() => {
    const kind = this.kind();
    return kind === 'bar' || kind === 'line' ? toCategoryChart(this.result(), kind) : null;
  });

  protected readonly canChart = computed(() => {
    const kind = this.kind();
    if (kind === 'kpi') return this.result().rows.length === 1;
    if (kind === 'table') return false;
    return this.result().rows.length > 0 && this.chart() !== null;
  });
}
