import { Component, computed, inject, input } from '@angular/core';
import type { AngularToolCall, RenderToolCallConfig, ToolRenderer } from '@copilotkit/angular';
import { SalesChart } from '../charts/sales-chart';
import { DashboardStore } from '../dashboard/dashboard-store';
import type { AggregateResponse } from '../data/sales-api';
import { type SalesView, salesViewSchema } from '../data/sales-view';
import { readToolResult } from './tool-result';

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
            <button type="button" class="pin" [disabled]="pinned()" (click)="dashboard.pin(view)">
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

  protected readonly dashboard = inject(DashboardStore);

  protected readonly view = computed(() => salesViewSchema.safeParse(this.toolCall().args).data);

  private readonly output = computed(() =>
    readToolResult<AggregateResponse, SalesView>(this.toolCall(), (output) => 'rows' in output),
  );
  protected readonly result = computed(() => this.output()?.value);
  protected readonly error = computed(() => this.output()?.error);

  protected readonly pinned = computed(() => {
    const view = this.view();
    return view ? this.dashboard.isPinned(view) : false;
  });
}

export const salesViewRenderer: RenderToolCallConfig<SalesView> = {
  name: 'querySales',
  args: salesViewSchema,
  component: SalesViewRenderer,
};
