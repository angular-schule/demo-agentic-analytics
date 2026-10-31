import { Component, inject } from '@angular/core';
import { DashboardStore } from './dashboard-store';
import { DashboardTile } from './dashboard-tile';

@Component({
  selector: 'app-dashboard',
  imports: [DashboardTile],
  template: `
    <header>
      <div>
        <h2>Dashboard</h2>
        <p>Pinned views query the backend directly, without the LLM.</p>
      </div>
      @if (store.tiles().length > 0) {
        <button type="button" class="clear" (click)="store.clear()">Clear</button>
      }
    </header>

    @if (store.tiles().length > 0) {
      <div class="grid">
        @for (tile of store.tiles(); track tile.id) {
          <app-dashboard-tile [tile]="tile" (remove)="store.remove(tile.id)" />
        }
      </div>
    } @else {
      <div class="empty">
        <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
          <rect x="4" y="4" width="18" height="18" rx="4" />
          <rect x="26" y="4" width="18" height="18" rx="4" />
          <rect x="4" y="26" width="40" height="18" rx="4" />
        </svg>
        <p><strong>Nothing pinned yet.</strong></p>
        <p>Ask a question in the chat, then pin the chart, or ask the assistant to pin it for you.</p>
      </div>
    }
  `,
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly store = inject(DashboardStore);
}
