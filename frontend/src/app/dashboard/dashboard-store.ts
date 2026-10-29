import { effect, Injectable, signal } from '@angular/core';
import { z } from 'zod';
import { type SalesView, salesViewSchema } from '../data/sales-view';

const STORAGE_KEY = 'agentic-analytics.dashboard';

const tileSchema = salesViewSchema.extend({ id: z.string() });
export type DashboardTile = z.infer<typeof tileSchema>;

/**
 * The pinned views. A tile stores the query, not the numbers: the dashboard asks the data backend
 * again on every visit, without the language model.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly tilesState = signal<DashboardTile[]>(load());
  readonly tiles = this.tilesState.asReadonly();

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tiles()));
      } catch {
        // Storage can be unavailable (private mode, quota); the dashboard then lives for this visit.
      }
    });
  }

  /** Pins a view. Views come from the model, so they are checked against the schema first. */
  pin(view: unknown): DashboardTile | null {
    const parsed = salesViewSchema.safeParse(view);
    if (!parsed.success) return null;
    const tile = { ...parsed.data, id: crypto.randomUUID() };
    this.tilesState.update((tiles) => [...tiles, tile]);
    return tile;
  }

  isPinned(view: SalesView): boolean {
    const key = viewKey(view);
    return this.tiles().some((tile) => viewKey(tile) === key);
  }

  remove(id: string): void {
    this.tilesState.update((tiles) => tiles.filter((tile) => tile.id !== id));
  }

  clear(): void {
    this.tilesState.set([]);
  }
}

/** Compares views by content: parsing puts the keys in schema order and drops unknown ones. */
function viewKey(view: SalesView): string {
  return JSON.stringify(salesViewSchema.parse(view));
}

/** Keeps every stored tile that is still valid; one broken tile must not cost the others. */
function load(): DashboardTile[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((item) => {
      const parsed = tileSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}
