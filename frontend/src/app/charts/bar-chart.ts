import { Component, computed, input, signal } from '@angular/core';
import { type CategoryChart, formatCompact, formatValue } from './chart-model';

interface BarMark {
  slot: number;
  label: string;
  value: number;
  left: number;
  width: number;
  negative: boolean;
}

/**
 * Horizontal bars, one row per category; with several series the bars of a row are grouped.
 * Bars grow from the zero baseline, so negative margins point left.
 */
@Component({
  selector: 'app-bar-chart',
  template: `
    @let chart = this.chart();
    <div class="rows" role="list" (mouseleave)="hovered.set(null)">
      @for (row of rows(); track row.category; let i = $index) {
        <div
          class="row"
          role="listitem"
          [class.active]="hovered() === i"
          (mouseenter)="hovered.set(i)"
        >
          <span class="category" [title]="row.category">{{ row.category }}</span>
          <span class="track">
            <span class="baseline" [style.left.%]="zero()"></span>
            @for (bar of row.bars; track bar.slot) {
              <span class="bar-line">
                <span
                  class="bar"
                  [class.negative]="bar.negative"
                  [style.left.%]="bar.left"
                  [style.width.%]="bar.width"
                  [style.background]="'var(--series-' + bar.slot + ')'"
                ></span>
                @if (chart.series.length === 1) {
                  <span class="tip" [style.left.%]="bar.negative ? bar.left : bar.left + bar.width" [class.negative]="bar.negative">
                    {{ compact(bar.value) }}
                  </span>
                }
              </span>
            }
          </span>
          @if (hovered() === i && chart.series.length > 1) {
            <span class="tooltip" role="tooltip">
              <strong>{{ row.category }}</strong>
              @for (bar of row.bars; track bar.slot) {
                <span class="tooltip-line">
                  <i class="key" [style.background]="'var(--series-' + bar.slot + ')'"></i>
                  {{ bar.label }}: {{ full(bar.value) }}
                </span>
              }
            </span>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './bar-chart.css',
})
export class BarChart {
  readonly chart = input.required<CategoryChart>();

  protected readonly hovered = signal<number | null>(null);

  protected readonly zero = computed(() => this.position(0));

  protected readonly rows = computed(() => {
    const chart = this.chart();
    const zero = this.zero();
    return chart.categories.map((category, index) => ({
      category,
      bars: chart.series.flatMap((series): BarMark[] => {
        const value = series.values[index];
        if (value === null || value === undefined) return [];
        const end = this.position(value);
        return [
          {
            slot: series.slot,
            label: series.label,
            value,
            left: Math.min(zero, end),
            width: Math.abs(end - zero),
            negative: value < 0,
          },
        ];
      }),
    }));
  });

  protected compact(value: number): string {
    return formatCompact(value, this.chart().measure.unit);
  }

  protected full(value: number): string {
    return formatValue(value, this.chart().measure.unit);
  }

  /**
   * Position on the value axis in percent. The right 18 % stay free for the value at the tip of a
   * positive bar, the left 22 % for the value of a negative one.
   */
  private position(value: number): number {
    const { min, max } = this.chart();
    const span = max - min || 1;
    const left = min < 0 ? 22 : 0;
    return left + ((value - min) / span) * (82 - left);
  }
}
