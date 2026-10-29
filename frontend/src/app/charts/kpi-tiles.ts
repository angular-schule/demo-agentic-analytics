import { Component, computed, input } from '@angular/core';
import type { AggregateResponse } from '../data/sales-api';
import { formatCompact, formatValue, humanize } from './chart-model';

/** A single-row result as stat tiles, one per measure. */
@Component({
  selector: 'app-kpi-tiles',
  template: `
    <div class="tiles">
      @for (tile of tiles(); track tile.label) {
        <div class="tile">
          <span class="label">{{ tile.label }}</span>
          <span class="value" [title]="tile.full">{{ tile.compact }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
      gap: 0.75rem;
    }
    .tile {
      display: grid;
      gap: 0.25rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--surface-1);
    }
    .label {
      color: var(--text-secondary);
      font-size: 0.8125rem;
    }
    .value {
      font-size: 1.6rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
  `,
})
export class KpiTiles {
  readonly result = input.required<AggregateResponse>();

  protected readonly tiles = computed(() => {
    const { columns, rows } = this.result();
    const row = rows[0] ?? {};
    return columns
      .filter((c) => c.kind === 'measure')
      .map((c) => {
        const value = row[c.name] ?? null;
        return {
          label: humanize(c.name),
          compact: typeof value === 'number' ? formatCompact(value, c.unit) : '–',
          full: formatValue(value, c.unit),
        };
      });
  });
}
