import { Component, computed, inject, input } from '@angular/core';
import type { AngularToolCall, RenderToolCallConfig, ToolRenderer } from '@copilotkit/angular';
import { SalesChart } from '../charts/sales-chart';
import { DashboardStore } from '../dashboard/dashboard-store';
import type { AggregateResponse } from '../data/sales-api';
import { type SalesView, salesViewSchema } from '../data/sales-view';

/**
 * Draws the agent's querySales calls in the chat. The tool runs in the agent; this component only
 * receives its arguments and its result, so the model never has to repeat the numbers as text.
 */
@Component({
  selector: 'app-sales-view-renderer',
  imports: [SalesChart],
  template: `
    @let call = toolCall();
    <section class="card" [attr.aria-busy]="call.status !== 'complete'">
      @if (result(); as result) {
        @if (view(); as view) {
          <app-sales-chart [title]="view.title" [kind]="view.chart" [result]="result" />
          <footer>
            <button type="button" class="pin" [disabled]="pinned()" (click)="pin(view)">
              {{ pinned() ? 'Pinned to dashboard' : 'Pin to dashboard' }}
            </button>
          </footer>
        } @else {
          <app-sales-chart [title]="call.args.title ?? 'Result'" kind="table" [result]="result" />
        }
      } @else if (error(); as error) {
        <p class="error"><strong>No result.</strong> {{ error }}</p>
      } @else {
        <p class="loading"><span class="pulse" aria-hidden="true"></span>{{ call.args.title ?? 'Querying sales' }} …</p>
      }
    </section>
  `,
  styleUrl: './sales-view-renderer.css',
})
export class SalesViewRenderer implements ToolRenderer<SalesView> {
  readonly toolCall = input.required<AngularToolCall<SalesView>>();

  private readonly dashboard = inject(DashboardStore);

  protected readonly view = computed(() => salesViewSchema.safeParse(this.toolCall().args).data);

  private readonly output = computed(() => {
    const call = this.toolCall();
    if (call.status !== 'complete') return undefined;
    try {
      const output: unknown = JSON.parse(call.result);
      if (typeof output === 'object' && output !== null) return output as AggregateResponse | { error: string };
    } catch {
      // Not JSON: handled below.
    }
    return { error: 'The agent returned no readable result.' };
  });

  protected readonly result = computed(() => {
    const output = this.output();
    return output && 'rows' in output ? output : undefined;
  });

  protected readonly error = computed(() => {
    const output = this.output();
    return output && 'error' in output ? output.error : undefined;
  });

  protected readonly pinned = computed(() => {
    const view = this.view();
    return view ? this.dashboard.isPinned(view) : false;
  });

  protected pin(view: SalesView): void {
    this.dashboard.pin(view);
  }
}

export const salesViewRenderer: RenderToolCallConfig<SalesView> = {
  name: 'querySales',
  args: salesViewSchema,
  component: SalesViewRenderer,
};
