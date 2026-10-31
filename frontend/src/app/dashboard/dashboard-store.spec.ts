import { TestBed } from '@angular/core/testing';
import { DashboardStore } from './dashboard-store';

const STORAGE_KEY = 'agentic-analytics.dashboard';
const view = { title: 'Revenue per year', chart: 'line' as const, query: { measures: ['revenue'], groupBy: ['year'] } };

describe('DashboardStore', () => {
  beforeEach(() => localStorage.clear());

  it('pins a view once, compared by content and not by key order', () => {
    const store = TestBed.inject(DashboardStore);
    expect(store.pin(view)).toBe(true);
    const reordered = { query: { groupBy: ['year'], measures: ['revenue'] }, chart: 'line' as const, title: 'Revenue per year' };
    expect(store.pin(reordered)).toBe(false);
    expect(store.tiles()).toHaveLength(1);
  });

  it('keeps the tiles in the browser', () => {
    const store = TestBed.inject(DashboardStore);
    store.pin(view);
    TestBed.tick();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toEqual([expect.objectContaining(view)]);
  });

  it('drops a broken stored tile but keeps the others', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...view, id: 'a' }, { title: 'broken', id: 'b' }]));
    const store = TestBed.inject(DashboardStore);
    expect(store.tiles().map((t) => t.id)).toEqual(['a']);
  });

  it('starts empty when the storage holds something else', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(TestBed.inject(DashboardStore).tiles()).toEqual([]);
  });
});
