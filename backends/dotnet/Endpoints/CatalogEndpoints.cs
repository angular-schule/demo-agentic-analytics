using AgenticAnalytics.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AgenticAnalytics.Api.Endpoints;

public sealed record ProductSummary(int ProductKey, string ProductName, string? ProductSubcategory, string? ProductCategory, string? Color, decimal? ListPrice, bool HasPhoto);

public sealed record ProductDetail(int ProductKey, string ProductName, string? ModelName, string? ProductSubcategory, string? ProductCategory, string? Color, decimal? ListPrice, string? Description, bool HasPhoto);

public sealed record ResellerSummary(int ResellerKey, string ResellerName, string BusinessType, string? City, string? StateProvince, string? Country, int? NumberEmployees, decimal? AnnualRevenue, int? YearOpened);

/// <summary>Product catalogue and reseller directory: plain lookups next to the aggregations.</summary>
public static class CatalogEndpoints
{
    private const int DefaultLimit = 20;
    private const int MaxLimit = 200;

    public static void MapCatalogEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/products", async (AnalyticsContext db, string? search, string? category, int? limit, CancellationToken ct) =>
        {
            var query = db.Products.AsQueryable();
            if (!string.IsNullOrWhiteSpace(search))
            {
                query = query.Where(p => p.ProductName.Contains(search));
            }
            if (!string.IsNullOrWhiteSpace(category))
            {
                query = query.Where(p => p.ProductCategory == category);
            }
            return await query
                .OrderBy(p => p.ProductName).ThenBy(p => p.ProductKey)
                .Take(Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit))
                .Select(p => new ProductSummary(p.ProductKey, p.ProductName, p.ProductSubcategory, p.ProductCategory, p.Color, p.ListPrice, p.LargePhoto != null))
                .ToListAsync(ct);
        });

        api.MapGet("/products/{productKey:int}", async (AnalyticsContext db, int productKey, CancellationToken ct) =>
        {
            var product = await db.Products
                .Where(p => p.ProductKey == productKey)
                .Select(p => new ProductDetail(p.ProductKey, p.ProductName, p.ModelName, p.ProductSubcategory, p.ProductCategory, p.Color, p.ListPrice, p.Description, p.LargePhoto != null))
                .FirstOrDefaultAsync(ct);
            return product is null ? Results.NotFound() : Results.Ok(product);
        });

        api.MapGet("/products/{productKey:int}/photo", async (AnalyticsContext db, int productKey, CancellationToken ct) =>
        {
            var photo = await db.Products.Where(p => p.ProductKey == productKey).Select(p => p.LargePhoto).FirstOrDefaultAsync(ct);
            return photo is null ? Results.NotFound() : Results.File(photo, "image/gif");
        });

        api.MapGet("/resellers", async (AnalyticsContext db, string? search, string? country, string? businessType, int? limit, CancellationToken ct) =>
        {
            var query = db.Resellers.AsQueryable();
            if (!string.IsNullOrWhiteSpace(search))
            {
                query = query.Where(r => r.ResellerName.Contains(search));
            }
            if (!string.IsNullOrWhiteSpace(country))
            {
                query = query.Where(r => r.Country == country);
            }
            if (!string.IsNullOrWhiteSpace(businessType))
            {
                query = query.Where(r => r.BusinessType == businessType);
            }
            return await query
                .OrderBy(r => r.ResellerName).ThenBy(r => r.ResellerKey)
                .Take(Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit))
                .Select(r => new ResellerSummary(r.ResellerKey, r.ResellerName, r.BusinessType, r.City, r.StateProvinceName, r.Country, r.NumberEmployees, r.AnnualRevenue, r.YearOpened))
                .ToListAsync(ct);
        });
    }
}
