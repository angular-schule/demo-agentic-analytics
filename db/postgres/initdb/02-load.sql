-- Loads Microsoft's official AdventureWorksDW CSV files (see Dockerfile) through an all-text staging table,
-- so hex images, bit flags and empty mandatory strings are converted in one place.

-- DimDate
CREATE TEMP TABLE stg (date_key text, full_date_alternate_key text, day_number_of_week text, english_day_name_of_week text, spanish_day_name_of_week text, french_day_name_of_week text, day_number_of_month text, day_number_of_year text, week_number_of_year text, english_month_name text, spanish_month_name text, french_month_name text, month_number_of_year text, calendar_quarter text, calendar_year text, calendar_semester text, fiscal_quarter text, fiscal_year text, fiscal_semester text);
\copy stg FROM '/aw-data/DimDate.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_date
SELECT date_key::integer, full_date_alternate_key::date, day_number_of_week::smallint, coalesce(english_day_name_of_week, ''), coalesce(spanish_day_name_of_week, ''), coalesce(french_day_name_of_week, ''), day_number_of_month::smallint, day_number_of_year::smallint, week_number_of_year::smallint, coalesce(english_month_name, ''), coalesce(spanish_month_name, ''), coalesce(french_month_name, ''), month_number_of_year::smallint, calendar_quarter::smallint, calendar_year::smallint, calendar_semester::smallint, fiscal_quarter::smallint, fiscal_year::smallint, fiscal_semester::smallint
FROM stg;
DROP TABLE stg;

-- DimCurrency
CREATE TEMP TABLE stg (currency_key text, currency_alternate_key text, currency_name text);
\copy stg FROM '/aw-data/DimCurrency.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_currency
SELECT currency_key::integer, coalesce(currency_alternate_key, ''), coalesce(currency_name, '')
FROM stg;
DROP TABLE stg;

-- DimSalesTerritory
CREATE TEMP TABLE stg (sales_territory_key text, sales_territory_alternate_key text, sales_territory_region text, sales_territory_country text, sales_territory_group text, sales_territory_image text);
\copy stg FROM '/aw-data/DimSalesTerritory.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_sales_territory
SELECT sales_territory_key::integer, sales_territory_alternate_key::integer, coalesce(sales_territory_region, ''), coalesce(sales_territory_country, ''), sales_territory_group, decode(sales_territory_image, 'hex')
FROM stg;
DROP TABLE stg;

-- DimGeography
CREATE TEMP TABLE stg (geography_key text, city text, state_province_code text, state_province_name text, country_region_code text, english_country_region_name text, spanish_country_region_name text, french_country_region_name text, postal_code text, sales_territory_key text, ip_address_locator text);
\copy stg FROM '/aw-data/DimGeography.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_geography
SELECT geography_key::integer, city, state_province_code, state_province_name, country_region_code, english_country_region_name, spanish_country_region_name, french_country_region_name, postal_code, sales_territory_key::integer, ip_address_locator
FROM stg;
DROP TABLE stg;

-- DimProductCategory
CREATE TEMP TABLE stg (product_category_key text, product_category_alternate_key text, english_product_category_name text, spanish_product_category_name text, french_product_category_name text);
\copy stg FROM '/aw-data/DimProductCategory.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_product_category
SELECT product_category_key::integer, product_category_alternate_key::integer, coalesce(english_product_category_name, ''), coalesce(spanish_product_category_name, ''), coalesce(french_product_category_name, '')
FROM stg;
DROP TABLE stg;

-- DimProductSubcategory
CREATE TEMP TABLE stg (product_subcategory_key text, product_subcategory_alternate_key text, english_product_subcategory_name text, spanish_product_subcategory_name text, french_product_subcategory_name text, product_category_key text);
\copy stg FROM '/aw-data/DimProductSubcategory.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_product_subcategory
SELECT product_subcategory_key::integer, product_subcategory_alternate_key::integer, coalesce(english_product_subcategory_name, ''), coalesce(spanish_product_subcategory_name, ''), coalesce(french_product_subcategory_name, ''), product_category_key::integer
FROM stg;
DROP TABLE stg;

-- DimProduct
CREATE TEMP TABLE stg (product_key text, product_alternate_key text, product_subcategory_key text, weight_unit_measure_code text, size_unit_measure_code text, english_product_name text, spanish_product_name text, french_product_name text, standard_cost text, finished_goods_flag text, color text, safety_stock_level text, reorder_point text, list_price text, size text, size_range text, weight text, days_to_manufacture text, product_line text, dealer_price text, class text, style text, model_name text, large_photo text, english_description text, french_description text, chinese_description text, arabic_description text, hebrew_description text, thai_description text, german_description text, japanese_description text, turkish_description text, start_date text, end_date text, status text);
\copy stg FROM '/aw-data/DimProduct.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_product
SELECT product_key::integer, product_alternate_key, product_subcategory_key::integer, weight_unit_measure_code, size_unit_measure_code, coalesce(english_product_name, ''), coalesce(spanish_product_name, ''), coalesce(french_product_name, ''), standard_cost::numeric(19,4), finished_goods_flag::boolean, coalesce(color, ''), safety_stock_level::smallint, reorder_point::smallint, list_price::numeric(19,4), size, size_range, weight::double precision, days_to_manufacture::integer, product_line, dealer_price::numeric(19,4), class, style, model_name, decode(large_photo, 'hex'), english_description, french_description, chinese_description, arabic_description, hebrew_description, thai_description, german_description, japanese_description, turkish_description, start_date::timestamp(3), end_date::timestamp(3), status
FROM stg;
DROP TABLE stg;

-- DimPromotion
CREATE TEMP TABLE stg (promotion_key text, promotion_alternate_key text, english_promotion_name text, spanish_promotion_name text, french_promotion_name text, discount_pct text, english_promotion_type text, spanish_promotion_type text, french_promotion_type text, english_promotion_category text, spanish_promotion_category text, french_promotion_category text, start_date text, end_date text, min_qty text, max_qty text);
\copy stg FROM '/aw-data/DimPromotion.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_promotion
SELECT promotion_key::integer, promotion_alternate_key::integer, english_promotion_name, spanish_promotion_name, french_promotion_name, discount_pct::double precision, english_promotion_type, spanish_promotion_type, french_promotion_type, english_promotion_category, spanish_promotion_category, french_promotion_category, start_date::timestamp(3), end_date::timestamp(3), min_qty::integer, max_qty::integer
FROM stg;
DROP TABLE stg;

-- DimCustomer
CREATE TEMP TABLE stg (customer_key text, geography_key text, customer_alternate_key text, title text, first_name text, middle_name text, last_name text, name_style text, birth_date text, marital_status text, suffix text, gender text, email_address text, yearly_income text, total_children text, number_children_at_home text, english_education text, spanish_education text, french_education text, english_occupation text, spanish_occupation text, french_occupation text, house_owner_flag text, number_cars_owned text, address_line1 text, address_line2 text, phone text, date_first_purchase text, commute_distance text);
\copy stg FROM '/aw-data/DimCustomer.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_customer
SELECT customer_key::integer, geography_key::integer, coalesce(customer_alternate_key, ''), title, first_name, middle_name, last_name, name_style::boolean, birth_date::date, marital_status, suffix, gender, email_address, yearly_income::numeric(19,4), total_children::smallint, number_children_at_home::smallint, english_education, spanish_education, french_education, english_occupation, spanish_occupation, french_occupation, house_owner_flag, number_cars_owned::smallint, address_line1, address_line2, phone, date_first_purchase::date, commute_distance
FROM stg;
DROP TABLE stg;

-- DimEmployee
CREATE TEMP TABLE stg (employee_key text, parent_employee_key text, employee_national_id_alternate_key text, parent_employee_national_id_alternate_key text, sales_territory_key text, first_name text, last_name text, middle_name text, name_style text, title text, hire_date text, birth_date text, login_id text, email_address text, phone text, marital_status text, emergency_contact_name text, emergency_contact_phone text, salaried_flag text, gender text, pay_frequency text, base_rate text, vacation_hours text, sick_leave_hours text, current_flag text, sales_person_flag text, department_name text, start_date text, end_date text, status text, employee_photo text);
\copy stg FROM '/aw-data/DimEmployee.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_employee
SELECT employee_key::integer, parent_employee_key::integer, employee_national_id_alternate_key, parent_employee_national_id_alternate_key, sales_territory_key::integer, coalesce(first_name, ''), coalesce(last_name, ''), middle_name, name_style::boolean, title, hire_date::date, birth_date::date, login_id, email_address, phone, marital_status, emergency_contact_name, emergency_contact_phone, salaried_flag::boolean, gender, pay_frequency::smallint, base_rate::numeric(19,4), vacation_hours::smallint, sick_leave_hours::smallint, current_flag::boolean, sales_person_flag::boolean, department_name, start_date::date, end_date::date, status, decode(employee_photo, 'hex')
FROM stg;
DROP TABLE stg;

-- DimReseller
CREATE TEMP TABLE stg (reseller_key text, geography_key text, reseller_alternate_key text, phone text, business_type text, reseller_name text, number_employees text, order_frequency text, order_month text, first_order_year text, last_order_year text, product_line text, address_line1 text, address_line2 text, annual_sales text, bank_name text, min_payment_type text, min_payment_amount text, annual_revenue text, year_opened text);
\copy stg FROM '/aw-data/DimReseller.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.dim_reseller
SELECT reseller_key::integer, geography_key::integer, reseller_alternate_key, phone, coalesce(business_type, ''), coalesce(reseller_name, ''), number_employees::integer, order_frequency, order_month::smallint, first_order_year::integer, last_order_year::integer, product_line, address_line1, address_line2, annual_sales::numeric(19,4), bank_name, min_payment_type::smallint, min_payment_amount::numeric(19,4), annual_revenue::numeric(19,4), year_opened::integer
FROM stg;
DROP TABLE stg;

-- FactInternetSales
CREATE TEMP TABLE stg (product_key text, order_date_key text, due_date_key text, ship_date_key text, customer_key text, promotion_key text, currency_key text, sales_territory_key text, sales_order_number text, sales_order_line_number text, revision_number text, order_quantity text, unit_price text, extended_amount text, unit_price_discount_pct text, discount_amount text, product_standard_cost text, total_product_cost text, sales_amount text, tax_amt text, freight text, carrier_tracking_number text, customer_po_number text, order_date text, due_date text, ship_date text);
\copy stg FROM '/aw-data/FactInternetSales.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.fact_internet_sales
SELECT product_key::integer, order_date_key::integer, due_date_key::integer, ship_date_key::integer, customer_key::integer, promotion_key::integer, currency_key::integer, sales_territory_key::integer, coalesce(sales_order_number, ''), sales_order_line_number::smallint, revision_number::smallint, order_quantity::smallint, unit_price::numeric(19,4), extended_amount::numeric(19,4), unit_price_discount_pct::double precision, discount_amount::double precision, product_standard_cost::numeric(19,4), total_product_cost::numeric(19,4), sales_amount::numeric(19,4), tax_amt::numeric(19,4), freight::numeric(19,4), carrier_tracking_number, customer_po_number, order_date::timestamp(3), due_date::timestamp(3), ship_date::timestamp(3)
FROM stg;
DROP TABLE stg;

-- FactResellerSales
CREATE TEMP TABLE stg (product_key text, order_date_key text, due_date_key text, ship_date_key text, reseller_key text, employee_key text, promotion_key text, currency_key text, sales_territory_key text, sales_order_number text, sales_order_line_number text, revision_number text, order_quantity text, unit_price text, extended_amount text, unit_price_discount_pct text, discount_amount text, product_standard_cost text, total_product_cost text, sales_amount text, tax_amt text, freight text, carrier_tracking_number text, customer_po_number text, order_date text, due_date text, ship_date text);
\copy stg FROM '/aw-data/FactResellerSales.csv' WITH (FORMAT csv, DELIMITER '|', QUOTE E'\x01')
INSERT INTO dw.fact_reseller_sales
SELECT product_key::integer, order_date_key::integer, due_date_key::integer, ship_date_key::integer, reseller_key::integer, employee_key::integer, promotion_key::integer, currency_key::integer, sales_territory_key::integer, coalesce(sales_order_number, ''), sales_order_line_number::smallint, revision_number::smallint, order_quantity::smallint, unit_price::numeric(19,4), extended_amount::numeric(19,4), unit_price_discount_pct::double precision, discount_amount::double precision, product_standard_cost::numeric(19,4), total_product_cost::numeric(19,4), sales_amount::numeric(19,4), tax_amt::numeric(19,4), freight::numeric(19,4), carrier_tracking_number, customer_po_number, order_date::timestamp(3), due_date::timestamp(3), ship_date::timestamp(3)
FROM stg;
DROP TABLE stg;
