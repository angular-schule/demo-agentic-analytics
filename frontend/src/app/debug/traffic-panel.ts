// DEBUG ONLY, for the demo's traffic window. Remove the folder `debug/` in a production application:
// the window shows the whole conversation, every tool result and the agent's answers.

import { JsonPipe } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { agUiExchanges, agUiTrafficEnabled } from './agui-traffic';

/** What the agent sent to the LLM provider and what came back, recorded by the backend (or the agent service). */
interface LlmExchange {
  id: number;
  startedAt: string;
  method: string;
  url: string;
  request: unknown;
  status?: number;
  durationMs?: number;
  response?: string;
}

/** Both kinds of exchange, shaped alike for the list and the detail view. */
interface TrafficEntry {
  id: number;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  request: unknown;
  events?: readonly unknown[];
  response?: string;
}

type Tab = 'ag-ui' | 'llm';

/**
 * Shows the two conversations behind every answer: the browser with the agent (AG-UI events) and
 * the agent with the LLM provider (the provider's own API). For learning how the layers talk.
 */
@Component({
  selector: 'app-traffic-panel',
  imports: [JsonPipe],
  template: `
    <header>
      <button type="button" class="toggle" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        {{ open() ? '▾' : '▸' }} Traffic
      </button>
      <div class="tabs" role="tablist" aria-label="Recorded traffic">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'ag-ui'" (click)="show('ag-ui')">
          Browser ↔ agent (AG-UI) <span class="count">{{ agUi().length }}</span>
        </button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'llm'" (click)="show('llm')">
          Agent ↔ LLM provider <span class="count">{{ llm().length }}</span>
        </button>
      </div>
      <span class="badge" title="Set DEBUG_TRAFFIC=off to switch it off, and remove it in a production application.">
        Debug feature, not for production
      </span>
    </header>
    @if (open()) {
      <div class="body">
        <ol class="list">
          @for (entry of entries(); track entry.id) {
            <li>
              <button type="button" [class.selected]="entry.id === selected()?.id" (click)="select(entry.id)">
                <span class="method">{{ entry.method }}</span> {{ entry.url }}
                <span class="meta">
                  {{ entry.status ?? '…' }}
                  @if (entry.events) {
                    · {{ entry.events.length }} events
                  }
                  @if (entry.durationMs !== undefined) {
                    · {{ entry.durationMs }} ms
                  }
                </span>
              </button>
            </li>
          } @empty {
            <li class="empty">Ask a question in the chat to see the traffic.</li>
          }
        </ol>
        <div class="detail">
          @if (selected(); as entry) {
            <h3>Request</h3>
            <pre>{{ entry.request | json }}</pre>
            @if (entry.events) {
              <h3>Events ({{ entry.events.length }})</h3>
              <ol class="events">
                @for (event of entry.events; track $index) {
                  <li>
                    <span class="type">{{ eventType(event) }}</span>
                    <code>{{ compact(event) }}</code>
                  </li>
                }
              </ol>
            } @else {
              <h3>Response</h3>
              <pre>{{ entry.response ?? '…' }}</pre>
            }
          }
        </div>
      </div>
    }
  `,
  styleUrl: './traffic-panel.css',
})
export class TrafficPanel {
  protected readonly open = signal(true);
  protected readonly tab = signal<Tab>('ag-ui');
  private readonly selectedId = signal<number | null>(null);

  protected readonly agUi = computed<TrafficEntry[]>(() => agUiExchanges().map((e) => ({ ...e, method: 'POST' })));
  protected readonly llm = signal<TrafficEntry[]>([]);
  protected readonly entries = computed(() => (this.tab() === 'ag-ui' ? this.agUi() : this.llm()));
  protected readonly selected = computed(() => {
    const entries = this.entries();
    return entries.find((e) => e.id === this.selectedId()) ?? entries[0];
  });

  constructor() {
    effect((onCleanup) => {
      if (!agUiTrafficEnabled()) return;
      const source = new EventSource('/agent/debug/llm');
      source.onmessage = (message: MessageEvent<string>) => {
        const exchange = JSON.parse(message.data) as LlmExchange;
        this.llm.update((all) => [exchange, ...all.filter((e) => e.id !== exchange.id)].sort((a, b) => b.id - a.id));
      };
      onCleanup(() => source.close());
    });
  }

  protected show(tab: Tab): void {
    this.tab.set(tab);
    this.selectedId.set(null);
    this.open.set(true);
  }

  protected select(id: number): void {
    this.selectedId.set(id);
  }

  protected compact(value: unknown): string {
    return JSON.stringify(value);
  }

  protected eventType(event: unknown): string {
    return typeof event === 'object' && event !== null && 'type' in event ? String(event.type) : '';
  }
}
