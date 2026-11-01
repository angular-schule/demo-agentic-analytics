import { customType, date, integer, numeric, pgSchema, smallint, varchar } from 'drizzle-orm/pg-core';

/**
 * The analytics views as Drizzle sees them. `.existing()` tells Drizzle the views are defined in the
 * database (db/postgres/initdb/04-analytics.sql) and must never be created or changed from here.
 */
const analytics = pgSchema('analytics');

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const sales = analytics
  .view('agent_view_sales', {
    channel: varchar('channel').notNull(),
    salesOrderNumber: varchar('sales_order_number').notNull(),
    orderDate: date('order_date', { mode: 'string' }).notNull(),
    orderYear: smallint('order_year').notNull(),
    orderQuarter: smallint('order_quarter').notNull(),
    orderMonth: smallint('order_month').notNull(),
    productKey: integer('product_key').notNull(),
    productName: varchar('product_name').notNull(),
    productSubcategory: varchar('product_subcategory').notNull(),
    productCategory: varchar('product_category').notNull(),
    productColor: varchar('product_color'),
    productLine: varchar('product_line'),
    promotionName: varchar('promotion_name').notNull(),
    promotionType: varchar('promotion_type').notNull(),
    salesTerritoryGroup: varchar('sales_territory_group'),
    salesTerritoryCountry: varchar('sales_territory_country').notNull(),
    salesTerritoryRegion: varchar('sales_territory_region').notNull(),
    resellerKey: integer('reseller_key'),
    resellerName: varchar('reseller_name'),
    resellerBusinessType: varchar('reseller_business_type'),
    resellerAnnualRevenue: integer('reseller_annual_revenue'),
    orderQuantity: smallint('order_quantity'),
    salesAmount: numeric('sales_amount'),
    totalProductCost: numeric('total_product_cost'),
    discountAmount: numeric('discount_amount'),
    freight: numeric('freight'),
  })
  .existing();

export const resellers = analytics
  .view('agent_view_resellers', {
    resellerKey: integer('reseller_key').notNull(),
    resellerName: varchar('reseller_name').notNull(),
    businessType: varchar('business_type').notNull(),
    city: varchar('city'),
    stateProvinceName: varchar('state_province_name'),
    country: varchar('country'),
    salesTerritoryGroup: varchar('sales_territory_group'),
    numberEmployees: integer('number_employees'),
    annualRevenue: numeric('annual_revenue', { mode: 'number' }),
    yearOpened: integer('year_opened'),
  })
  .existing();

export const products = analytics
  .view('agent_view_products', {
    productKey: integer('product_key').notNull(),
    productName: varchar('product_name').notNull(),
    modelName: varchar('model_name'),
    productSubcategory: varchar('product_subcategory'),
    productCategory: varchar('product_category'),
    color: varchar('color'),
    listPrice: numeric('list_price', { mode: 'number' }),
    description: varchar('description'),
    largePhoto: bytea('large_photo'),
  })
  .existing();
