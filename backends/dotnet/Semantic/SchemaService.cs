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
/// small dimensions the exact values, so filters can use them verbatim.
/// </summary>
public sealed class SchemaService(AnalyticsContext db, DataScope scope)
{
    public async Task<SchemaResponse> GetAsync(CancellationToken cancellationToken)
    {
        var dimensions = new List<DimensionInfo>();
        foreach (var dimension in SalesModel.Dimensions)
        {
            var values = dimension.ListValues ? await DistinctValuesAsync(dimension, cancellationToken) : null;
            dimensions.Add(new DimensionInfo(dimension.Name, dimension.Label, dimension.Description, dimension.IsNumeric ? "integer" : "string", values));
        }

        var from = await db.Sales.Select(s => (DateOnly?)s.OrderDate).MinAsync(cancellationToken);
        var to = await db.Sales.Select(s => (DateOnly?)s.OrderDate).MaxAsync(cancellationToken);

        return new SchemaResponse(
            new DatasetInfo(
                "AdventureWorks sales",
                "Order lines of a fictitious bicycle manufacturer, sold online to consumers and through resellers. Contains no data about natural persons.",
                "USD",
                from ?? default,
                to ?? default,
                scope.TerritoryGroup),
            dimensions,
            SalesModel.Measures.Select(m => new MeasureInfo(m.Name, m.Label, m.Description, m.Unit)).ToList(),
            new QueryLimits(SalesAggregator.MaxGroupBy, SalesAggregator.MaxFilters, SalesAggregator.DefaultLimit, SalesAggregator.MaxLimit));
    }

    private async Task<IReadOnlyList<object>> DistinctValuesAsync(DimensionDefinition dimension, CancellationToken cancellationToken)
    {
        if (dimension.Selector is Expression<Func<Sale, int>> numeric)
        {
            var numbers = await db.Sales.Select(numeric).Distinct().OrderBy(v => v).ToListAsync(cancellationToken);
            return numbers.Cast<object>().ToList();
        }

        var text = (Expression<Func<Sale, string?>>)dimension.Selector;
        var strings = await db.Sales.Select(text).Where(v => v != null).Distinct().OrderBy(v => v).ToListAsync(cancellationToken);
        return strings.OfType<object>().ToList();
    }
}
