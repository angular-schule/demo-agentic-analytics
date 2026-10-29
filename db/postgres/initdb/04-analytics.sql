-- The analytics schema is the only thing the application is allowed to read.
--
-- Data minimisation: the views contain no reference to a natural person. Customers (online sales)
-- and sales representatives (reseller sales, the "key account managers") stay in dw and never
-- appear here, not even as a key. Companies are not persons, so resellers keep their names.
--
-- Data scope: every connection states which sales territory group it may see by setting
-- analytics.territory_group ('*' for all, or 'Europe', 'North America', 'Pacific').
-- Without that setting the views return no rows (fail closed).
-- security_barrier keeps the planner from evaluating user-supplied conditions before that filter.

CREATE SCHEMA analytics;

-- One row per order line of both sales channels. Amounts in USD.
CREATE VIEW analytics.sales WITH (security_barrier) AS
WITH lines AS (
  SELECT 'Online' AS channel, sales_order_number, order_date_key, product_key, sales_territory_key,
         NULL::integer AS reseller_key, order_quantity, sales_amount, total_product_cost
  FROM dw.fact_internet_sales
  UNION ALL
  SELECT 'Reseller', sales_order_number, order_date_key, product_key, sales_territory_key,
         reseller_key, order_quantity, sales_amount, total_product_cost
  FROM dw.fact_reseller_sales
)
SELECT l.channel,
       l.sales_order_number,
       d.full_date_alternate_key AS order_date,
       d.calendar_year AS order_year,
       d.calendar_quarter AS order_quarter,
       d.month_number_of_year AS order_month,
       l.product_key,
       p.english_product_name AS product_name,
       ps.english_product_subcategory_name AS product_subcategory,
       pc.english_product_category_name AS product_category,
       t.sales_territory_group,
       t.sales_territory_country,
       t.sales_territory_region,
       l.reseller_key,
       r.reseller_name,
       r.business_type AS reseller_business_type,
       l.order_quantity,
       l.sales_amount,
       l.total_product_cost
FROM lines l
JOIN dw.dim_date d ON d.date_key = l.order_date_key
JOIN dw.dim_product p ON p.product_key = l.product_key
JOIN dw.dim_product_subcategory ps ON ps.product_subcategory_key = p.product_subcategory_key
JOIN dw.dim_product_category pc ON pc.product_category_key = ps.product_category_key
JOIN dw.dim_sales_territory t ON t.sales_territory_key = l.sales_territory_key
LEFT JOIN dw.dim_reseller r ON r.reseller_key = l.reseller_key
WHERE current_setting('analytics.territory_group', true) IN ('*', t.sales_territory_group);

-- Resellers are companies. Phone, street address and bank details are left out anyway:
-- an analysis does not need them.
CREATE VIEW analytics.resellers WITH (security_barrier) AS
SELECT r.reseller_key,
       r.reseller_name,
       r.business_type,
       g.city,
       g.state_province_name,
       g.english_country_region_name AS country,
       t.sales_territory_group,
       r.number_employees,
       r.annual_revenue,
       r.year_opened
FROM dw.dim_reseller r
JOIN dw.dim_geography g ON g.geography_key = r.geography_key
JOIN dw.dim_sales_territory t ON t.sales_territory_key = g.sales_territory_key
WHERE current_setting('analytics.territory_group', true) IN ('*', t.sales_territory_group);

-- The product catalogue is the same for every territory.
CREATE VIEW analytics.products AS
SELECT p.product_key,
       p.english_product_name AS product_name,
       p.model_name,
       ps.english_product_subcategory_name AS product_subcategory,
       pc.english_product_category_name AS product_category,
       NULLIF(p.color, 'NA') AS color,
       p.list_price,
       p.english_description AS description,
       p.large_photo
FROM dw.dim_product p
LEFT JOIN dw.dim_product_subcategory ps ON ps.product_subcategory_key = p.product_subcategory_key
LEFT JOIN dw.dim_product_category pc ON pc.product_category_key = ps.product_category_key;
