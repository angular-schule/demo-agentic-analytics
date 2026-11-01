import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { AngularToolCall, RenderToolCallConfig, ToolRenderer } from '@copilotkit/angular';
import { z } from 'zod';
import type { ResellerSummary } from '../data/sales-api';
import { readToolResult } from './tool-result';

const findResellersSchema = z.object({ search: z.string(), country: z.string().optional(), limit: z.number().optional() });
type FindResellersArgs = z.infer<typeof findResellersSchema>;

/** Draws the agent's findResellers calls as cards: the companies, not the people who work there. */
@Component({
  selector: 'app-reseller-cards-renderer',
  imports: [CurrencyPipe],
  template: `
    @if (resellers(); as resellers) {
      @if (resellers.length === 0) {
        <p class="empty">No reseller matches “{{ toolCall().args.search }}”.</p>
      } @else {
        <ul class="cards">
          @for (reseller of resellers; track reseller.resellerKey) {
            <li class="card">
              <strong>{{ reseller.resellerName }}</strong>
              <span class="meta">{{ reseller.businessType }}</span>
              <span>{{ location(reseller) }}</span>
              @if (reseller.numberEmployees !== null) {
                <span>{{ reseller.numberEmployees }} employees</span>
              }
              @if (reseller.annualRevenue !== null) {
                <span>{{ reseller.annualRevenue | currency: 'USD' : 'symbol' : '1.0-0' }} annual revenue</span>
              }
              @if (reseller.yearOpened !== null) {
                <span class="meta">Opened {{ reseller.yearOpened }}</span>
              }
            </li>
          }
        </ul>
      }
    } @else if (error(); as error) {
      <p class="empty">The reseller search failed. {{ error }}</p>
    } @else {
      <p class="empty">Searching resellers for “{{ toolCall().args.search }}” …</p>
    }
  `,
  styleUrl: './cards.css',
})
export class ResellerCardsRenderer implements ToolRenderer<FindResellersArgs> {
  readonly toolCall = input.required<AngularToolCall<FindResellersArgs>>();

  private readonly output = computed(() =>
    readToolResult<{ resellers: ResellerSummary[] }, FindResellersArgs>(
      this.toolCall(),
      (output) => 'resellers' in output && Array.isArray(output.resellers),
    ),
  );
  protected readonly resellers = computed(() => this.output()?.value?.resellers);
  protected readonly error = computed(() => this.output()?.error);

  protected location(reseller: ResellerSummary): string {
    return [reseller.city, reseller.country].filter(Boolean).join(', ') || 'Unknown location';
  }
}

export const resellerCardsRenderer: RenderToolCallConfig<FindResellersArgs> = {
  name: 'findResellers',
  args: findResellersSchema,
  component: ResellerCardsRenderer,
};
