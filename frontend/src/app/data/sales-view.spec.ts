import { salesViewSchema } from './sales-view';

const view = { title: 'Revenue per year', chart: 'line', query: { measures: ['revenue'], groupBy: ['year'] } };

describe('salesViewSchema', () => {
  it('accepts the view the agent sends', () => {
    expect(salesViewSchema.safeParse(view).success).toBe(true);
  });

  it('rejects a chart kind the app cannot draw', () => {
    expect(salesViewSchema.safeParse({ ...view, chart: 'pie' }).success).toBe(false);
  });

  it('rejects a query without a measure', () => {
    expect(salesViewSchema.safeParse({ ...view, query: { measures: [] } }).success).toBe(false);
  });

  // Optional is not nullable: a generator that writes "filters": null must be caught, see the article.
  it('rejects null for an optional field', () => {
    expect(salesViewSchema.safeParse({ ...view, query: { ...view.query, filters: null } }).success).toBe(false);
  });
});
