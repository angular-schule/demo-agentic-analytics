import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import type { AngularToolCall, RenderToolCallConfig, ToolRenderer } from '@copilotkit/angular';
import { z } from 'zod';
import { type ProductSummary, SalesApi } from '../data/sales-api';

const findProductsSchema = z.object({ search: z.string(), limit: z.number().optional() });
type FindProductsArgs = z.infer<typeof findProductsSchema>;

/**
 * Draws the agent's findProducts calls as cards. The photos load straight from the data backend:
 * the model only ever sees product keys and names, never the images.
 */
@Component({
  selector: 'app-product-cards-renderer',
  imports: [CurrencyPipe],
  template: `
    @if (products(); as products) {
      @if (products === 'error') {
        <p class="empty">The product search failed.</p>
      } @else if (products.length === 0) {
        <p class="empty">No products match “{{ toolCall().args.search }}”.</p>
      } @else {
        <ul class="cards">
          @for (product of products; track product.productKey) {
            <li class="card">
              @if (product.hasPhoto) {
                <img [src]="photoUrl(product.productKey)" [alt]="product.productName" loading="lazy" />
              } @else {
                <span class="no-photo">No photo</span>
              }
              <strong>{{ product.productName }}</strong>
              <span class="meta">{{ product.productSubcategory ?? product.productCategory ?? 'Uncategorised' }}</span>
              @if (product.listPrice !== null) {
                <span class="price">{{ product.listPrice | currency: 'USD' }}</span>
              }
            </li>
          }
        </ul>
      }
    } @else {
      <p class="empty">Searching products for “{{ toolCall().args.search }}” …</p>
    }
  `,
  styleUrl: './product-cards-renderer.css',
})
export class ProductCardsRenderer implements ToolRenderer<FindProductsArgs> {
  readonly toolCall = input.required<AngularToolCall<FindProductsArgs>>();

  private readonly api = inject(SalesApi);

  protected readonly products = computed(() => {
    const call = this.toolCall();
    if (call.status !== 'complete') return undefined;
    try {
      const output: unknown = JSON.parse(call.result);
      if (typeof output === 'object' && output !== null && 'products' in output && Array.isArray(output.products)) {
        return output.products as ProductSummary[];
      }
    } catch {
      // Not JSON: handled below.
    }
    return 'error' as const;
  });

  protected photoUrl(productKey: number): string {
    return this.api.photoUrl(productKey);
  }
}

export const productCardsRenderer: RenderToolCallConfig<FindProductsArgs> = {
  name: 'findProducts',
  args: findProductsSchema,
  component: ProductCardsRenderer,
};
