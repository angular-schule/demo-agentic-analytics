import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, eq, ilike, isNotNull, SQL } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { products, resellers } from '../db/analytics.schema';
import { DrizzleService } from '../db/drizzle.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

/** Product catalogue and reseller directory: plain lookups next to the aggregations. */
@ApiTags('catalog')
@Controller('api')
export class CatalogController {
  constructor(private readonly drizzle: DrizzleService) {}

  @Get('products')
  async listProducts(@Query('search') search?: string, @Query('category') category?: string, @Query('limit') limit?: string) {
    const conditions: SQL[] = [];
    if (search?.trim()) conditions.push(ilike(products.productName, containsPattern(search)));
    if (category?.trim()) conditions.push(eq(products.productCategory, category));

    return this.drizzle.db
      .select({
        productKey: products.productKey,
        productName: products.productName,
        productSubcategory: products.productSubcategory,
        productCategory: products.productCategory,
        color: products.color,
        listPrice: products.listPrice,
        hasPhoto: isNotNull(products.largePhoto),
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.productName), asc(products.productKey))
      .limit(clampLimit(limit));
  }

  @Get('products/:productKey')
  async getProduct(@Param('productKey', ParseIntPipe) productKey: number) {
    const [product] = await this.drizzle.db
      .select({
        productKey: products.productKey,
        productName: products.productName,
        modelName: products.modelName,
        productSubcategory: products.productSubcategory,
        productCategory: products.productCategory,
        color: products.color,
        listPrice: products.listPrice,
        description: products.description,
        hasPhoto: isNotNull(products.largePhoto),
      })
      .from(products)
      .where(eq(products.productKey, productKey));
    if (!product) throw new NotFoundException();
    return product;
  }

  @Get('products/:productKey/photo')
  async getPhoto(@Param('productKey', ParseIntPipe) productKey: number, @Res() reply: FastifyReply) {
    const [row] = await this.drizzle.db
      .select({ photo: products.largePhoto })
      .from(products)
      .where(eq(products.productKey, productKey));
    if (!row?.photo) throw new NotFoundException();
    return reply.type('image/gif').send(row.photo);
  }

  @Get('resellers')
  async listResellers(
    @Query('search') search?: string,
    @Query('country') country?: string,
    @Query('businessType') businessType?: string,
    @Query('limit') limit?: string,
  ) {
    const conditions: SQL[] = [];
    if (search?.trim()) conditions.push(ilike(resellers.resellerName, containsPattern(search)));
    if (country?.trim()) conditions.push(eq(resellers.country, country));
    if (businessType?.trim()) conditions.push(eq(resellers.businessType, businessType));

    return this.drizzle.db
      .select({
        resellerKey: resellers.resellerKey,
        resellerName: resellers.resellerName,
        businessType: resellers.businessType,
        city: resellers.city,
        stateProvince: resellers.stateProvinceName,
        country: resellers.country,
        numberEmployees: resellers.numberEmployees,
        annualRevenue: resellers.annualRevenue,
        yearOpened: resellers.yearOpened,
      })
      .from(resellers)
      .where(and(...conditions))
      .orderBy(asc(resellers.resellerName), asc(resellers.resellerKey))
      .limit(clampLimit(limit));
  }
}

/** Case-insensitive substring match; % and _ in the search text are matched literally. */
function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

function clampLimit(limit: string | undefined): number {
  const value = Number.parseInt(limit ?? '', 10);
  return Number.isNaN(value) ? DEFAULT_LIMIT : Math.min(Math.max(value, 1), MAX_LIMIT);
}
