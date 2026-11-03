// DEBUG ONLY, for the demo's traffic window. Remove the folder `debug/` in a production application:
// the window shows the whole conversation, every tool result and the agent's answers.

import { JsonPipe } from '@angular/common';
import { Component, computed, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { type AgUiEvent, agUiExchanges } from './agui-traffic';

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
  events?: readonly AgUiEvent[];
  response?: string;
}

type Tab = 'ag-ui' | 'llm';

const KEPT_EXCHANGES = 50;

/**
 * Shows the two conversations behind every answer: the browser with the agent (AG-UI events) and
 * the agent with the LLM provider (the provider's own API). For learning how the layers talk.
 */
@Component({
  selector: 'app-traffic-panel',
  imports: [JsonPipe],
  template: `
    <div
      class="resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the traffic window"
      title="Drag to resize, drag down to close"
      tabindex="0"
      (pointerdown)="startResize($event)"
      (keydown)="resizeByKey($event)"
    ></div>
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
      <div class="body" [style.height.px]="height()">
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
                    <span class="type">{{ event.type }}</span>
                    <code>{{ event.json }}</code>
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
  /** Height of the open window in pixels, set by dragging; until then the stylesheet decides. */
  protected readonly height = signal<number | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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
    // The window is only rendered while DEBUG_TRAFFIC is on. The backend resends its kept exchanges on
    // every (re)connect, with ids that start again after a restart, so the list starts over each time.
    const source = new EventSource('/agent/debug/llm');
    source.onopen = () => this.llm.set([]);
    source.onmessage = (message: MessageEvent<string>) => {
      const exchange = JSON.parse(message.data) as LlmExchange;
      this.llm.update((all) => {
        const index = all.findIndex((e) => e.id === exchange.id);
        if (index === -1) return [exchange, ...all].slice(0, KEPT_EXCHANGES);
        return all.map((e, i) => (i === index ? exchange : e));
      });
    };
    inject(DestroyRef).onDestroy(() => source.close());
  }

  protected show(tab: Tab): void {
    this.tab.set(tab);
    this.selectedId.set(null);
    this.open.set(true);
  }

  /** Drags the top edge: up makes the window taller, down to the header closes it, up again reopens it. */
  protected startResize(event: PointerEvent): void {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    // Without this, dragging selects the text of the whole page on the way.
    const root = document.documentElement;
    root.style.userSelect = 'none';
    const move = (e: PointerEvent) => this.resizeTo(window.innerHeight - e.clientY - this.chromeHeight());
    const stop = () => {
      root.style.userSelect = '';
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  protected resizeByKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
    if (step === 0) return;
    event.preventDefault();
    const body = this.host.nativeElement.querySelector<HTMLElement>('.body');
    this.resizeTo((this.open() && body ? body.offsetHeight : 0) + step);
  }

  private resizeTo(bodyHeight: number): void {
    if (bodyHeight < 60) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    this.height.set(Math.round(Math.min(bodyHeight, window.innerHeight * 0.8)));
  }

  /** Everything of the window above its body: the drag handle and the header. */
  private chromeHeight(): number {
    const header = this.host.nativeElement.querySelector('header');
    return (header?.getBoundingClientRect().bottom ?? 0) - this.host.nativeElement.getBoundingClientRect().top;
  }

  protected select(id: number): void {
    this.selectedId.set(id);
  }
}
