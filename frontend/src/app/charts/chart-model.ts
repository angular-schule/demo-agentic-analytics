import type { AggregateResponse, CellValue, ResultColumn } from '../data/sales-api';

/** Categorical slots in fixed order; a series keeps its slot, never a cycled hue. */
export const MAX_SERIES = 8;
const TIME_DIMENSIONS = ['year', 'quarter', 'month'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Series {
  label: string;
  /** 1-based categorical slot, see --series-n in styles.css. */
  slot: number;
  values: (number | null)[];
}

export interface CategoryChart {
  categories: string[];
  series: Series[];
  /** The first plotted measure; every plotted measure shares its unit. */
  measure: ResultColumn;
  /** What the value axis shows, e.g. "Margin (USD)". */
  caption: string;
  /** Smallest and largest value, always including zero (bars and axes start at the baseline). */
  min: number;
  max: number;
}

export function humanize(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatDimension(name: string, value: CellValue): string {
  if (value === null) return '(none)';
  if (name === 'quarter') return `Q${value}`;
  if (name === 'month' && typeof value === 'number') return MONTHS[value - 1] ?? String(value);
  return String(value);
}

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Full value, for tables and tooltips. */
export function formatValue(value: CellValue, unit: string | null): string {
  if (value === null) return '–';
  if (typeof value === 'string') return value;
  return unit === 'USD' ? currency.format(value) : integer.format(value);
}

/** Compact value from 1,000 up, for axis ticks, bar tips and stat tiles. */
export function formatCompact(value: number, unit: string | null): string {
  if (Math.abs(value) < 1000) return formatValue(value, unit);
  return unit === 'USD' ? compactCurrency.format(value) : compact.format(value);
}

/**
 * Turns an aggregate result into categories and series. For a line chart the time dimensions form
 * the x-axis, for a bar chart the first dimension does; every other dimension becomes a series.
 * Without such a dimension, the measures that share the first measure's unit become the series
 * (revenue next to margin, never revenue next to orders on one axis). Series beyond the eighth
 * fold into "Other".
 */
export function toCategoryChart(result: AggregateResponse, kind: 'bar' | 'line'): CategoryChart | null {
  const dimensions = result.columns.filter((c) => c.kind === 'dimension');
  const measures = result.columns.filter((c) => c.kind === 'measure');
  const measure = measures[0];
  if (!measure) return null;

  // Year before quarter before month, whatever order the request grouped them in.
  const timeDimensions = dimensions
    .filter((d) => TIME_DIMENSIONS.includes(d.name))
    .sort((a, b) => TIME_DIMENSIONS.indexOf(a.name) - TIME_DIMENSIONS.indexOf(b.name));
  const xDimensions =
    kind === 'line' && timeDimensions.length > 0 ? timeDimensions : dimensions.slice(0, 1);
  const seriesDimensions = dimensions.filter((d) => !xDimensions.includes(d));
  const plotted = seriesDimensions.length > 0 ? [measure] : measures.filter((m) => m.unit === measure.unit);
  const unit = measure.unit ? ` (${measure.unit})` : '';
  const caption = plotted.length > 1 ? `Values${unit}` : `${humanize(measure.name)}${unit}`;

  const label = (row: AggregateResponse['rows'][number], columns: ResultColumn[]) =>
    columns.map((c) => formatDimension(c.name, row[c.name] ?? null)).join(' ');

  let rows = result.rows;
  if (kind === 'line') {
    rows = [...rows].sort((a, b) => compareRows(a, b, xDimensions));
  }

  const categories: string[] = [];
  const seen = new Set<string>();
  const cells = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    const category = xDimensions.length > 0 ? label(row, xDimensions) : humanize(measure.name);
    if (!seen.has(category)) {
      seen.add(category);
      categories.push(category);
    }
    for (const m of plotted) {
      const seriesKey = seriesDimensions.length > 0 ? label(row, seriesDimensions) : humanize(m.name);
      const value = row[m.name];
      if (typeof value !== 'number') continue;
      const bySeries = cells.get(seriesKey) ?? new Map<string, number>();
      bySeries.set(category, (bySeries.get(category) ?? 0) + value);
      cells.set(seriesKey, bySeries);
      totals.set(seriesKey, (totals.get(seriesKey) ?? 0) + Math.abs(value));
    }
  }

  const ranked = [...cells.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  const kept = ranked.length > MAX_SERIES ? ranked.slice(0, MAX_SERIES - 1) : ranked;
  const folded = ranked.slice(kept.length);

  const series: Series[] = kept.map((key, index) => ({
    label: key,
    slot: index + 1,
    values: categories.map((c) => cells.get(key)?.get(c) ?? null),
  }));
  if (folded.length > 0) {
    series.push({
      label: 'Other',
      slot: MAX_SERIES,
      values: categories.map((c) => {
        const values = folded.map((key) => cells.get(key)?.get(c)).filter((v) => v !== undefined);
        return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) : null;
      }),
    });
  }

  const values = series.flatMap((s) => s.values).filter((v) => v !== null);
  return { categories, series, measure, caption, min: Math.min(0, ...values), max: Math.max(0, ...values) };
}

function compareRows(a: AggregateResponse['rows'][number], b: AggregateResponse['rows'][number], columns: ResultColumn[]): number {
  for (const column of columns) {
    const left = a[column.name] ?? null;
    const right = b[column.name] ?? null;
    if (left === right) continue;
    if (left === null) return -1;
    if (right === null) return 1;
    return left < right ? -1 : 1;
  }
  return 0;
}

/**
 * Clean tick values (1, 2 or 5 times a power of ten, at least 1) that enclose min and max; the
 * first and last tick are the axis domain. Every measure is a whole number or rounded to whole
 * units on the axis, so a smaller step would only repeat labels.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min, min + 1];
  const rough = (max - min) / count;
  const power = 10 ** Math.max(Math.floor(Math.log10(rough)), 0);
  const step = [1, 2, 5, 10].map((f) => f * power).find((s) => s >= rough) ?? rough;
  const first = Math.floor(min / step);
  const last = Math.ceil(max / step);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(i * step);
  return ticks;
}
