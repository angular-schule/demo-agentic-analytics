import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { and, asc, eq, ilike, SQL, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { products, resellers } from '../db/analytics.schema';
import { DrizzleService } from '../db/drizzle.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export class ProductSummary {
  @ApiProperty({ type: 'integer', format: 'int32' }) productKey!: number;
  @ApiProperty({ type: String }) productName!: string;
  @ApiProperty({ type: String, nullable: true }) productSubcategory!: string | null;
  @ApiProperty({ type: String, nullable: true }) productCategory!: string | null;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty({ type: 'number', format: 'double', nullable: true }) listPrice!: number | null;
  @ApiProperty({ type: Boolean }) hasPhoto!: boolean;
}

export class ProductDetail {
  @ApiProperty({ type: 'integer', format: 'int32' }) productKey!: number;
  @ApiProperty({ type: String }) productName!: string;
  @ApiProperty({ type: String, nullable: true }) modelName!: string | null;
  @ApiProperty({ type: String, nullable: true }) productSubcategory!: string | null;
  @ApiProperty({ type: String, nullable: true }) productCategory!: string | null;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty({ type: 'number', format: 'double', nullable: true }) listPrice!: number | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: Boolean }) hasPhoto!: boolean;
}

export class ResellerSummary {
  @ApiProperty({ type: 'integer', format: 'int32' }) resellerKey!: number;
  @ApiProperty({ type: String }) resellerName!: string;
  @ApiProperty({ type: String }) businessType!: string;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) stateProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: 'integer', format: 'int32', nullable: true }) numberEmployees!: number | null;
  @ApiProperty({ type: 'number', format: 'double', nullable: true }) annualRevenue!: number | null;
  @ApiProperty({ type: 'integer', format: 'int32', nullable: true }) yearOpened!: number | null;
}

const LIMIT_QUERY = { name: 'limit', required: false, schema: { type: 'integer', format: 'int32' } } as const;
const PRODUCT_KEY = { name: 'productKey', schema: { type: 'integer', format: 'int32' } } as const;

const productSummaryColumns = {
  productKey: products.productKey,
  productName: products.productName,
  productSubcategory: products.productSubcategory,
  productCategory: products.productCategory,
  color: products.color,
  listPrice: products.listPrice,
  hasPhoto: sql<boolean>`${products.largePhoto} is not null`,
};

/** Products by part of the name and by category, for GET /api/products and the agent's tool findProducts. */
export function searchProducts(drizzle: DrizzleService, search: string | undefined, category: string | undefined, limit: number): Promise<ProductSummary[]> {
  const conditions: SQL[] = [];
  if (search?.trim()) conditions.push(ilike(products.productName, containsPattern(search)));
  if (category?.trim()) conditions.push(eq(products.productCategory, category));

  return drizzle.db
    .select(productSummaryColumns)
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.productName), asc(products.productKey))
    .limit(limit);
}

/** Resellers by part of the name, country and business type, for GET /api/resellers and the agent's tool findResellers. */
export function searchResellers(
  drizzle: DrizzleService,
  search: string | undefined,
  country: string | undefined,
  businessType: string | undefined,
  limit: number,
): Promise<ResellerSummary[]> {
  const conditions: SQL[] = [];
  if (search?.trim()) conditions.push(ilike(resellers.resellerName, containsPattern(search)));
  if (country?.trim()) conditions.push(eq(resellers.country, country));
  if (businessType?.trim()) conditions.push(eq(resellers.businessType, businessType));

  return drizzle.db
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
    .limit(limit);
}

/** Product catalogue and reseller directory: plain lookups next to the aggregations. */
@ApiTags('catalog')
@Controller('api')
export class CatalogController {
  constructor(private readonly drizzle: DrizzleService) {}

  @Get('products')
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery(LIMIT_QUERY)
  @ApiOkResponse({ type: [ProductSummary] })
  async listProducts(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ProductSummary[]> {
    return searchProducts(this.drizzle, search, category, clampLimit(limit));
  }

  @Get('products/:productKey')
  @ApiParam(PRODUCT_KEY)
  @ApiOkResponse({ type: ProductDetail })
  @ApiNotFoundResponse()
  async getProduct(@Param('productKey', ParseIntPipe) productKey: number): Promise<ProductDetail> {
    const [product] = await this.drizzle.db
      .select({ ...productSummaryColumns, modelName: products.modelName, description: products.description })
      .from(products)
      .where(eq(products.productKey, productKey));
    if (!product) throw new NotFoundException();
    return product;
  }

  @Get('products/:productKey/photo')
  @ApiParam(PRODUCT_KEY)
  @ApiOkResponse({ content: { 'image/gif': { schema: { type: 'string', format: 'binary' } } } })
  @ApiNotFoundResponse()
  async getPhoto(@Param('productKey', ParseIntPipe) productKey: number, @Res() reply: FastifyReply) {
    const [row] = await this.drizzle.db
      .select({ photo: products.largePhoto })
      .from(products)
      .where(eq(products.productKey, productKey));
    if (!row?.photo) throw new NotFoundException();
    // Product photos practically never change; browsers may reuse one for an hour.
    return reply.type('image/gif').header('cache-control', 'public, max-age=3600').send(row.photo);
  }

  @Get('resellers')
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'country', required: false, type: String })
  @ApiQuery({ name: 'businessType', required: false, type: String })
  @ApiQuery(LIMIT_QUERY)
  @ApiOkResponse({ type: [ResellerSummary] })
  async listResellers(
    @Query('search') search?: string,
    @Query('country') country?: string,
    @Query('businessType') businessType?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<ResellerSummary[]> {
    return searchResellers(this.drizzle, search, country, businessType, clampLimit(limit));
  }
}

/** Case-insensitive substring match; % and _ in the search text are matched literally. */
function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}
