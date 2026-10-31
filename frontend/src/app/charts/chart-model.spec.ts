import type { AggregateResponse, ResultColumn } from '../data/sales-api';
import { formatCompact, formatDimension, formatValue, niceTicks, resolveView, toCategoryChart } from './chart-model';

const dimension = (name: string): ResultColumn => ({ name, kind: 'dimension', unit: null });
const measure = (name: string, unit: string | null = 'USD'): ResultColumn => ({ name, kind: 'measure', unit });
const result = (columns: ResultColumn[], rows: AggregateResponse['rows']): AggregateResponse =>
  ({ columns, rows, rowCount: rows.length, truncated: false }) as AggregateResponse;

describe('resolveView', () => {
  it('shows a stat tile only for exactly one row', () => {
    expect(resolveView(result([measure('revenue')], [{ revenue: 1 }]), 'kpi').kind).toBe('kpi');
    expect(resolveView(result([dimension('year'), measure('revenue')], [{ year: 2012, revenue: 1 }, { year: 2013, revenue: 2 }]), 'kpi').kind).toBe('table');
  });

  it('falls back to the table without a measure', () => {
    expect(resolveView(result([dimension('country')], [{ country: 'France' }]), 'bar').kind).toBe('table');
  });
});

describe('toCategoryChart', () => {
  it('puts a time series in chronological order, whatever order the rows come in', () => {
    const chart = toCategoryChart(
      result([dimension('quarter'), dimension('year'), measure('revenue')], [
        { year: 2013, quarter: 1, revenue: 3 },
        { year: 2012, quarter: 4, revenue: 2 },
        { year: 2012, quarter: 3, revenue: 1 },
      ]),
      'line',
    );
    expect(chart?.categories).toEqual(['2012 Q3', '2012 Q4', '2013 Q1']);
    expect(chart?.series[0]?.values).toEqual([1, 2, 3]);
  });

  it('turns a second dimension into series, ranked by size', () => {
    const chart = toCategoryChart(
      result([dimension('year'), dimension('channel'), measure('revenue')], [
        { year: 2013, channel: 'Online', revenue: 1 },
        { year: 2013, channel: 'Reseller', revenue: 5 },
      ]),
      'bar',
    );
    expect(chart?.series.map((s) => s.label)).toEqual(['Reseller', 'Online']);
    expect(chart?.series.map((s) => s.slot)).toEqual([1, 2]);
  });

  it('plots measures side by side only when they share a unit', () => {
    const chart = toCategoryChart(
      result([dimension('productCategory'), measure('revenue'), measure('margin'), measure('orders', null)], [
        { productCategory: 'Bikes', revenue: 10, margin: 2, orders: 7 },
      ]),
      'bar',
    );
    expect(chart?.series.map((s) => s.label)).toEqual(['Revenue', 'Margin']);
    expect(chart?.caption).toBe('Values (USD)');
  });

  it('folds series beyond the eighth into "Other"', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ year: 2013, country: `Country ${i}`, revenue: 100 - i }));
    const chart = toCategoryChart(result([dimension('year'), dimension('country'), measure('revenue')], rows), 'bar');
    expect(chart?.series).toHaveLength(8);
    expect(chart?.series.at(-1)).toMatchObject({ label: 'Other', slot: 8, values: [92 + 91 + 93] });
  });

  it('includes zero in the value range, so bars start at the baseline', () => {
    const chart = toCategoryChart(result([dimension('year'), measure('margin')], [{ year: 2013, margin: -5 }, { year: 2014, margin: 10 }]), 'bar');
    expect([chart?.min, chart?.max]).toEqual([-5, 10]);
  });
});

describe('formatting', () => {
  it('labels quarters, months and missing values', () => {
    expect(formatDimension('quarter', 2)).toBe('Q2');
    expect(formatDimension('month', 12)).toBe('Dec');
    expect(formatDimension('reseller', null)).toBe('(none)');
  });

  it('writes money in full for tables and compact for axes', () => {
    expect(formatValue(1234567, 'USD')).toBe('$1,234,567');
    expect(formatCompact(1234567, 'USD')).toBe('$1.2M');
    expect(formatCompact(999, null)).toBe('999');
  });

  it('finds clean ticks that enclose the values', () => {
    expect(niceTicks(0, 95)).toEqual([0, 50, 100]);
    expect(niceTicks(-5, 10)).toEqual([-5, 0, 5, 10]);
  });
});
