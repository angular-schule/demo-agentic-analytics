import { Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { type CategoryChart, formatCompact, formatValue, niceTicks } from './chart-model';

const HEIGHT = 240;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 64 };

/**
 * A time series as lines, one per series, drawn at the measured width so text and markers keep
 * their size. Hovering shows a crosshair with every series' value.
 */
@Component({
  selector: 'app-line-chart',
  template: `
    @let plot = this.plot();
    <svg [attr.width]="width()" [attr.height]="height" role="img" [attr.aria-label]="ariaLabel()"
      (mousemove)="hover($event)" (mouseleave)="hovered.set(null)">
      @for (tick of plot.ticks; track tick.value) {
        <line class="grid" [attr.x1]="margin.left" [attr.x2]="width() - margin.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
        <text class="axis" [attr.x]="margin.left - 8" [attr.y]="tick.y" text-anchor="end" dominant-baseline="middle">{{ tick.label }}</text>
      }
      @for (label of plot.xLabels; track label.index) {
        <text class="axis" [attr.x]="label.x" [attr.y]="height - 8" text-anchor="middle">{{ label.text }}</text>
      }
      @if (plot.zeroY !== null) {
        <line class="baseline" [attr.x1]="margin.left" [attr.x2]="width() - margin.right" [attr.y1]="plot.zeroY" [attr.y2]="plot.zeroY" />
      }
      @for (line of plot.lines; track line.slot) {
        <path class="line" [attr.d]="line.path" [style.stroke]="'var(--series-' + line.slot + ')'" />
        @if (line.end) {
          <circle class="marker" [attr.cx]="line.end.x" [attr.cy]="line.end.y" r="4" [style.fill]="'var(--series-' + line.slot + ')'" />
        }
      }
      @if (hoveredPoint(); as point) {
        <line class="crosshair" [attr.x1]="point.x" [attr.x2]="point.x" [attr.y1]="margin.top" [attr.y2]="height - margin.bottom" />
        @for (dot of point.dots; track dot.slot) {
          <circle class="marker" [attr.cx]="point.x" [attr.cy]="dot.y" r="4" [style.fill]="'var(--series-' + dot.slot + ')'" />
        }
      }
    </svg>
    @if (hoveredPoint(); as point) {
      <div class="tooltip" role="tooltip" [style.left.px]="point.x" [class.flip]="point.x > width() / 2">
        <strong>{{ point.category }}</strong>
        @for (dot of point.dots; track dot.slot) {
          <span class="tooltip-line">
            <i class="key" [style.background]="'var(--series-' + dot.slot + ')'"></i>
            @if (chart().series.length > 1) {
              {{ dot.label }}:
            }
            {{ dot.text }}
          </span>
        }
      </div>
    }
  `,
  styleUrl: './line-chart.css',
})
export class LineChart {
  readonly chart = input.required<CategoryChart>();

  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly width = signal(600);
  protected readonly hovered = signal<number | null>(null);

  protected readonly ariaLabel = computed(
    () => `Line chart of ${this.chart().measure.name} over ${this.chart().categories.length} periods`,
  );

  private readonly scale = computed(() => {
    const chart = this.chart();
    const ticks = niceTicks(chart.min, chart.max);
    const low = ticks[0] ?? chart.min;
    const high = ticks[ticks.length - 1] ?? chart.max;
    const innerWidth = this.width() - MARGIN.left - MARGIN.right;
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const count = Math.max(chart.categories.length - 1, 1);
    return {
      ticks,
      x: (index: number) => MARGIN.left + (index / count) * innerWidth,
      y: (value: number) => MARGIN.top + (1 - (value - low) / (high - low || 1)) * innerHeight,
    };
  });

  protected readonly plot = computed(() => {
    const chart = this.chart();
    const { ticks, x, y } = this.scale();
    const unit = chart.measure.unit;
    const every = Math.ceil(chart.categories.length / Math.max(Math.floor(this.width() / 72), 1));

    return {
      ticks: ticks.map((value) => ({ value, y: y(value), label: formatCompact(value, unit) })),
      xLabels: chart.categories
        .map((text, index) => ({ text, index, x: x(index) }))
        .filter((label) => label.index % every === 0),
      zeroY: chart.min < 0 ? y(0) : null,
      lines: chart.series.map((series) => {
        // A period without a value interrupts the line instead of bridging it.
        let path = '';
        let previous: number | null = null;
        let end: { x: number; y: number } | null = null;
        for (const [index, value] of series.values.entries()) {
          if (value !== null) {
            end = { x: x(index), y: y(value) };
            path += `${previous === null ? 'M' : 'L'}${end.x.toFixed(1)},${end.y.toFixed(1)}`;
          }
          previous = value;
        }
        return { slot: series.slot, path, end };
      }),
    };
  });

  protected readonly hoveredPoint = computed(() => {
    const index = this.hovered();
    if (index === null) return null;
    const chart = this.chart();
    const { x, y } = this.scale();
    return {
      x: x(index),
      category: chart.categories[index] ?? '',
      dots: chart.series.flatMap((series) => {
        const value = series.values[index];
        return value === null || value === undefined
          ? []
          : [{ slot: series.slot, label: series.label, y: y(value), text: formatValue(value, chart.measure.unit) }];
      }),
    };
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) this.width.set(Math.max(Math.floor(entry.contentRect.width), 240));
    });
    observer.observe(host);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  protected hover(event: MouseEvent): void {
    const count = this.chart().categories.length;
    const innerWidth = this.width() - MARGIN.left - MARGIN.right;
    // Relative to the SVG itself: offsetX would refer to whichever line or marker is under the pointer.
    const svg = event.currentTarget as SVGSVGElement;
    const ratio = (event.clientX - svg.getBoundingClientRect().left - MARGIN.left) / innerWidth;
    this.hovered.set(Math.min(Math.max(Math.round(ratio * (count - 1)), 0), count - 1));
  }
}
