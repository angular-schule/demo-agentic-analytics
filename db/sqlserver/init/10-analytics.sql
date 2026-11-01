-- The analytics schema is the only thing the application is allowed to read.
--
-- Every view carries the prefix AgentView, as the warehouse tables carry Fact and Dim: the name says
-- what the view is for, so it can later be traced to the application that reads it.
--
-- Data minimisation: the views contain no reference to a natural person. Customers (online sales)
-- and sales representatives (reseller sales, the "key account managers") stay in dbo and never
-- appear here, not even as a key. Companies are not persons, so resellers keep their names.
--
-- Data scope: every connection states which sales territory group it may see via
-- sp_set_session_context N'TerritoryGroup' ('*' for all, or 'Europe', 'North America', 'Pacific').
-- Without that value the views return no rows (fail closed).

USE AdventureWorksDW;
GO

CREATE SCHEMA analytics AUTHORIZATION dbo;
GO

-- One row per order line of both sales channels. Amounts in USD.
CREATE VIEW analytics.AgentViewSales AS
WITH Lines AS (
  SELECT N'Online' AS Channel, SalesOrderNumber, OrderDateKey, ProductKey, SalesTerritoryKey,
         CAST(NULL AS int) AS ResellerKey, OrderQuantity, SalesAmount, TotalProductCost
  FROM dbo.FactInternetSales
  UNION ALL
  SELECT N'Reseller', SalesOrderNumber, OrderDateKey, ProductKey, SalesTerritoryKey,
         ResellerKey, OrderQuantity, SalesAmount, TotalProductCost
  FROM dbo.FactResellerSales
)
SELECT l.Channel,
       l.SalesOrderNumber,
       d.FullDateAlternateKey AS OrderDate,
       d.CalendarYear AS OrderYear,
       d.CalendarQuarter AS OrderQuarter,
       d.MonthNumberOfYear AS OrderMonth,
       l.ProductKey,
       p.EnglishProductName AS ProductName,
       ps.EnglishProductSubcategoryName AS ProductSubcategory,
       pc.EnglishProductCategoryName AS ProductCategory,
       t.SalesTerritoryGroup,
       t.SalesTerritoryCountry,
       t.SalesTerritoryRegion,
       l.ResellerKey,
       r.ResellerName,
       r.BusinessType AS ResellerBusinessType,
       l.OrderQuantity,
       l.SalesAmount,
       l.TotalProductCost
FROM Lines l
JOIN dbo.DimDate d ON d.DateKey = l.OrderDateKey
JOIN dbo.DimProduct p ON p.ProductKey = l.ProductKey
JOIN dbo.DimProductSubcategory ps ON ps.ProductSubcategoryKey = p.ProductSubcategoryKey
JOIN dbo.DimProductCategory pc ON pc.ProductCategoryKey = ps.ProductCategoryKey
JOIN dbo.DimSalesTerritory t ON t.SalesTerritoryKey = l.SalesTerritoryKey
LEFT JOIN dbo.DimReseller r ON r.ResellerKey = l.ResellerKey
WHERE CAST(SESSION_CONTEXT(N'TerritoryGroup') AS nvarchar(50)) IN (N'*', t.SalesTerritoryGroup);
GO

-- Resellers are companies. Phone, street address and bank details are left out anyway:
-- an analysis does not need them.
CREATE VIEW analytics.AgentViewResellers AS
SELECT r.ResellerKey,
       r.ResellerName,
       r.BusinessType,
       g.City,
       g.StateProvinceName,
       g.EnglishCountryRegionName AS Country,
       t.SalesTerritoryGroup,
       r.NumberEmployees,
       r.AnnualRevenue,
       r.YearOpened
FROM dbo.DimReseller r
JOIN dbo.DimGeography g ON g.GeographyKey = r.GeographyKey
JOIN dbo.DimSalesTerritory t ON t.SalesTerritoryKey = g.SalesTerritoryKey
WHERE CAST(SESSION_CONTEXT(N'TerritoryGroup') AS nvarchar(50)) IN (N'*', t.SalesTerritoryGroup);
GO

-- The product catalogue is the same for every territory.
CREATE VIEW analytics.AgentViewProducts AS
SELECT p.ProductKey,
       p.EnglishProductName AS ProductName,
       p.ModelName,
       ps.EnglishProductSubcategoryName AS ProductSubcategory,
       pc.EnglishProductCategoryName AS ProductCategory,
       NULLIF(p.Color, N'NA') AS Color,
       p.ListPrice,
       p.EnglishDescription AS Description,
       p.LargePhoto
FROM dbo.DimProduct p
LEFT JOIN dbo.DimProductSubcategory ps ON ps.ProductSubcategoryKey = p.ProductSubcategoryKey
LEFT JOIN dbo.DimProductCategory pc ON pc.ProductCategoryKey = ps.ProductCategoryKey;
GO

-- The application connects as AnalyticsReader. It can read the analytics views and nothing else:
-- the views reach dbo through ownership chaining, the login itself has no rights on dbo, so names,
-- e-mail addresses and salaries are out of reach even for a compromised backend.
CREATE LOGIN AnalyticsReader WITH PASSWORD = N'$(ReaderPassword)', DEFAULT_DATABASE = AdventureWorksDW;
CREATE USER AnalyticsReader FOR LOGIN AnalyticsReader;
GRANT SELECT ON SCHEMA::analytics TO AnalyticsReader;
GO
