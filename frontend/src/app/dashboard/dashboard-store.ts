import { computed, effect, Injectable, signal } from '@angular/core';
import { z } from 'zod';
import { type SalesView, salesViewSchema } from '../data/sales-view';

const STORAGE_KEY = 'agentic-analytics.dashboard';

const tileSchema = salesViewSchema.extend({ id: z.string() });
export type DashboardTile = z.infer<typeof tileSchema>;

/**
 * The pinned views. A tile stores the query, not the numbers: the dashboard asks the backend
 * again on every visit, without the LLM.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly tilesState = signal<DashboardTile[]>(load());
  readonly tiles = this.tilesState.asReadonly();
  private readonly pinnedKeys = computed(() => new Set(this.tiles().map(viewKey)));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tiles()));
      } catch {
        // Storage can be unavailable (private mode, quota); the dashboard then lives for this visit.
      }
    });
  }

  /** Pins a parsed view, unless the same view is already on the dashboard. */
  pin(view: SalesView): boolean {
    if (this.isPinned(view)) return false;
    this.tilesState.update((tiles) => [...tiles, { ...view, id: crypto.randomUUID() }]);
    return true;
  }

  isPinned(view: SalesView): boolean {
    return this.pinnedKeys().has(viewKey(view));
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
