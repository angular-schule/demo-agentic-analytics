import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { AngularToolCall, RenderToolCallConfig, ToolRenderer } from '@copilotkit/angular';
import { z } from 'zod';
import { photoUrl, type ProductSummary } from '../data/sales-api';
import { readToolResult } from './tool-result';

const findProductsSchema = z.object({ search: z.string(), limit: z.number().optional() });
type FindProductsArgs = z.infer<typeof findProductsSchema>;

/**
 * Draws the agent's findProducts calls as cards. The photos load straight from the backend:
 * the model only ever sees product keys and names, never the images.
 */
@Component({
  selector: 'app-product-cards-renderer',
  imports: [CurrencyPipe],
  template: `
    @if (products(); as products) {
      @if (products.length === 0) {
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
    } @else if (error(); as error) {
      <p class="empty">The product search failed. {{ error }}</p>
    } @else {
      <p class="empty">Searching products for “{{ toolCall().args.search }}” …</p>
    }
  `,
  styleUrl: './product-cards-renderer.css',
})
export class ProductCardsRenderer implements ToolRenderer<FindProductsArgs> {
  readonly toolCall = input.required<AngularToolCall<FindProductsArgs>>();

  protected readonly photoUrl = photoUrl;

  private readonly output = computed(() =>
    readToolResult<{ products: ProductSummary[] }, FindProductsArgs>(
      this.toolCall(),
      (output) => 'products' in output && Array.isArray(output.products),
    ),
  );
  protected readonly products = computed(() => this.output()?.value?.products);
  protected readonly error = computed(() => this.output()?.error);
}

export const productCardsRenderer: RenderToolCallConfig<FindProductsArgs> = {
  name: 'findProducts',
  args: findProductsSchema,
  component: ProductCardsRenderer,
};
