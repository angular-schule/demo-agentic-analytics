import { Component, input } from '@angular/core';
import type { AggregateResponse, CellValue, ResultColumn } from '../data/sales-api';
import { formatDimension, formatValue, humanize } from './chart-model';

/** The result as a plain table: every chart can switch to it, so nothing depends on color alone. */
@Component({
  selector: 'app-data-table',
  template: `
    <div class="scroll">
      <table>
        <thead>
          <tr>
            @for (column of result().columns; track column.name) {
              <th [class.number]="column.kind === 'measure'">{{ label(column) }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of result().rows; track $index) {
            <tr>
              @for (column of result().columns; track column.name) {
                <td [class.number]="column.kind === 'measure'">{{ cell(column, row[column.name] ?? null) }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .scroll {
      max-height: 22rem;
      overflow: auto;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }
    th,
    td {
      padding: 0.35rem 0.65rem;
      border-bottom: 1px solid var(--border-color);
      text-align: left;
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--surface-2);
      color: var(--text-secondary);
      font-weight: 600;
    }
    tbody tr:last-child td {
      border-bottom: 0;
    }
    .number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class DataTable {
  readonly result = input.required<AggregateResponse>();

  protected label(column: ResultColumn): string {
    return humanize(column.name) + (column.unit ? ` (${column.unit})` : '');
  }

  protected cell(column: ResultColumn, value: CellValue): string {
    return column.kind === 'measure' ? formatValue(value, column.unit) : formatDimension(column.name, value);
  }
}
