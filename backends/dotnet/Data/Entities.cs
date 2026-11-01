namespace AgenticAnalytics.Api.Data;

/// <summary>One order line from analytics.AgentViewSales (online and reseller channel).</summary>
public sealed class Sale
{
    public required string Channel { get; init; }
    public required string SalesOrderNumber { get; init; }
    public DateOnly OrderDate { get; init; }
    public short OrderYear { get; init; }
    public byte OrderQuarter { get; init; }
    public byte OrderMonth { get; init; }
    public int ProductKey { get; init; }
    public required string ProductName { get; init; }
    public required string ProductSubcategory { get; init; }
    public required string ProductCategory { get; init; }
    public string? ProductColor { get; init; }
    public string? ProductLine { get; init; }
    public required string PromotionName { get; init; }
    public required string PromotionType { get; init; }
    public string? SalesTerritoryGroup { get; init; }
    public required string SalesTerritoryCountry { get; init; }
    public required string SalesTerritoryRegion { get; init; }
    public int? ResellerKey { get; init; }
    public string? ResellerName { get; init; }
    public string? ResellerBusinessType { get; init; }
    public int? ResellerAnnualRevenue { get; init; }
    public short? OrderQuantity { get; init; }
    public decimal? SalesAmount { get; init; }
    public decimal? TotalProductCost { get; init; }
    public decimal? DiscountAmount { get; init; }
    public decimal? Freight { get; init; }
}

/// <summary>A reseller (a company) from analytics.AgentViewResellers.</summary>
public sealed class Reseller
{
    public int ResellerKey { get; init; }
    public required string ResellerName { get; init; }
    public required string BusinessType { get; init; }
    public string? City { get; init; }
    public string? StateProvinceName { get; init; }
    public string? Country { get; init; }
    public string? SalesTerritoryGroup { get; init; }
    public int? NumberEmployees { get; init; }
    public decimal? AnnualRevenue { get; init; }
    public int? YearOpened { get; init; }
}

/// <summary>A catalogue entry from analytics.AgentViewProducts.</summary>
public sealed class Product
{
    public int ProductKey { get; init; }
    public required string ProductName { get; init; }
    public string? ModelName { get; init; }
    public string? ProductSubcategory { get; init; }
    public string? ProductCategory { get; init; }
    public string? Color { get; init; }
    public decimal? ListPrice { get; init; }
    public string? Description { get; init; }
    public byte[]? LargePhoto { get; init; }
}
