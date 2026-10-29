-- Primary and foreign keys as in the SQL Server original. Added after the load, which is the usual
-- order for bulk imports: the data arrives faster without index maintenance, and every key is
-- still checked once against the complete data.

ALTER TABLE dw.dim_date ADD PRIMARY KEY (date_key);
ALTER TABLE dw.dim_currency ADD PRIMARY KEY (currency_key);
ALTER TABLE dw.dim_sales_territory ADD PRIMARY KEY (sales_territory_key);
ALTER TABLE dw.dim_geography ADD PRIMARY KEY (geography_key);
ALTER TABLE dw.dim_product_category ADD PRIMARY KEY (product_category_key);
ALTER TABLE dw.dim_product_subcategory ADD PRIMARY KEY (product_subcategory_key);
ALTER TABLE dw.dim_product ADD PRIMARY KEY (product_key);
ALTER TABLE dw.dim_promotion ADD PRIMARY KEY (promotion_key);
ALTER TABLE dw.dim_customer ADD PRIMARY KEY (customer_key);
ALTER TABLE dw.dim_employee ADD PRIMARY KEY (employee_key);
ALTER TABLE dw.dim_reseller ADD PRIMARY KEY (reseller_key);
ALTER TABLE dw.fact_internet_sales ADD PRIMARY KEY (sales_order_number, sales_order_line_number);
ALTER TABLE dw.fact_reseller_sales ADD PRIMARY KEY (sales_order_number, sales_order_line_number);

ALTER TABLE dw.dim_geography ADD FOREIGN KEY (sales_territory_key) REFERENCES dw.dim_sales_territory;
ALTER TABLE dw.dim_product_subcategory ADD FOREIGN KEY (product_category_key) REFERENCES dw.dim_product_category;
ALTER TABLE dw.dim_product ADD FOREIGN KEY (product_subcategory_key) REFERENCES dw.dim_product_subcategory;
ALTER TABLE dw.dim_customer ADD FOREIGN KEY (geography_key) REFERENCES dw.dim_geography;
ALTER TABLE dw.dim_employee ADD FOREIGN KEY (parent_employee_key) REFERENCES dw.dim_employee;
ALTER TABLE dw.dim_employee ADD FOREIGN KEY (sales_territory_key) REFERENCES dw.dim_sales_territory;
ALTER TABLE dw.dim_reseller ADD FOREIGN KEY (geography_key) REFERENCES dw.dim_geography;

ALTER TABLE dw.fact_internet_sales
  ADD FOREIGN KEY (product_key) REFERENCES dw.dim_product,
  ADD FOREIGN KEY (order_date_key) REFERENCES dw.dim_date,
  ADD FOREIGN KEY (due_date_key) REFERENCES dw.dim_date,
  ADD FOREIGN KEY (ship_date_key) REFERENCES dw.dim_date,
  ADD FOREIGN KEY (customer_key) REFERENCES dw.dim_customer,
  ADD FOREIGN KEY (promotion_key) REFERENCES dw.dim_promotion,
  ADD FOREIGN KEY (currency_key) REFERENCES dw.dim_currency,
  ADD FOREIGN KEY (sales_territory_key) REFERENCES dw.dim_sales_territory;

ALTER TABLE dw.fact_reseller_sales
  ADD FOREIGN KEY (product_key) REFERENCES dw.dim_product,
  ADD FOREIGN KEY (order_date_key) REFERENCES dw.dim_date,
  ADD FOREIGN KEY (due_date_key) REFERENCES dw.dim_date,
  ADD FOREIGN KEY (ship_date_key) REFERENCES dw.dim_date,
  ADD FOREIGN KEY (reseller_key) REFERENCES dw.dim_reseller,
  ADD FOREIGN KEY (employee_key) REFERENCES dw.dim_employee,
  ADD FOREIGN KEY (promotion_key) REFERENCES dw.dim_promotion,
  ADD FOREIGN KEY (currency_key) REFERENCES dw.dim_currency,
  ADD FOREIGN KEY (sales_territory_key) REFERENCES dw.dim_sales_territory;

ANALYZE;
