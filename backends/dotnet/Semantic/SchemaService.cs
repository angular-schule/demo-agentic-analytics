using System.Linq.Expressions;
using AgenticAnalytics.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AgenticAnalytics.Api.Semantic;

public sealed record DimensionInfo(string Name, string Label, string Description, string Type, IReadOnlyList<object>? Values);

public sealed record MeasureInfo(string Name, string Label, string Description, string? Unit);

public sealed record DatasetInfo(string Name, string Description, string Currency, DateOnly From, DateOnly To, string Scope);

public sealed record QueryLimits(int MaxGroupBy, int MaxFilters, int DefaultLimit, int MaxLimit);

public sealed record SchemaResponse(DatasetInfo Dataset, IReadOnlyList<DimensionInfo> Dimensions, IReadOnlyList<MeasureInfo> Measures, QueryLimits Limits);

/// <summary>
/// Describes the semantic layer for the language model: which dimensions and measures exist, and for
/// small dimensions the exact values, so filters can use them verbatim. The data does not change while
/// the backend runs, so the schema is built once; a failed attempt is retried on the next call.
/// </summary>
public sealed class SchemaService(IServiceScopeFactory scopes, DataScope scope)
{
    private Task<SchemaResponse>? schema;

    public async Task<SchemaResponse> GetAsync()
    {
        var task = schema ??= LoadAsync();
        try
        {
            return await task;
        }
        catch
        {
            _ = Interlocked.CompareExchange(ref schema, null, task);
            throw;
        }
    }

    private async Task<SchemaResponse> LoadAsync()
    {
        // One DbContext per query, so the queries run side by side.
        var dimensions = Task.WhenAll(SalesModel.Dimensions.Select(async dimension => new DimensionInfo(
            dimension.Name,
            dimension.Label,
            dimension.Description,
            dimension.IsNumeric ? "integer" : "string",
            dimension.ListValues ? await QueryAsync(db => DistinctValuesAsync(db, dimension)) : null)));
        var period = await QueryAsync(db => db.Sales
            .GroupBy(_ => 1)
            .Select(g => new { From = g.Min(s => s.OrderDate), To = g.Max(s => s.OrderDate) })
            .FirstOrDefaultAsync());

        return new SchemaResponse(
            new DatasetInfo(
                "AdventureWorks sales",
                "Order lines of a fictitious bicycle manufacturer, sold online to consumers and through resellers. Contains no data about natural persons.",
                "USD",
                period?.From ?? default,
                period?.To ?? default,
                scope.TerritoryGroup),
            await dimensions,
            SalesModel.Measures.Select(m => new MeasureInfo(m.Name, m.Label, m.Description, m.Unit)).ToList(),
            new QueryLimits(SalesAggregator.MaxGroupBy, SalesAggregator.MaxFilters, SalesAggregator.DefaultLimit, SalesAggregator.MaxLimit));
    }

    private async Task<T> QueryAsync<T>(Func<AnalyticsContext, Task<T>> query)
    {
        await using var serviceScope = scopes.CreateAsyncScope();
        return await query(serviceScope.ServiceProvider.GetRequiredService<AnalyticsContext>());
    }

    private static async Task<IReadOnlyList<object>> DistinctValuesAsync(AnalyticsContext db, DimensionDefinition dimension)
    {
        if (dimension.Selector is Expression<Func<Sale, int>> numeric)
        {
            var numbers = await db.Sales.Select(numeric).Distinct().OrderBy(v => v).ToListAsync();
            return numbers.Cast<object>().ToList();
        }

        var text = (Expression<Func<Sale, string?>>)dimension.Selector;
        var strings = await db.Sales.Select(text).Where(v => v != null).Distinct().OrderBy(v => v).ToListAsync();
        return strings.OfType<object>().ToList();
    }
}
