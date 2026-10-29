using System.Linq.Expressions;
using System.Text.Json;
using AgenticAnalytics.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AgenticAnalytics.Api.Semantic;

/// <summary>Up to three grouping values. Numeric dimensions use I0..I2, text dimensions S0..S2.</summary>
public sealed class GroupKey
{
    public int? I0 { get; init; }
    public int? I1 { get; init; }
    public int? I2 { get; init; }
    public string? S0 { get; init; }
    public string? S1 { get; init; }
    public string? S2 { get; init; }
}

public sealed class GroupRow
{
    public GroupKey Key { get; init; } = new();
    public decimal Revenue { get; init; }
    public decimal Cost { get; init; }
    public decimal Margin { get; init; }
    public int Quantity { get; init; }
    public int Orders { get; init; }
}

/// <summary>
/// Turns an <see cref="AggregateRequest"/> into one LINQ query over analytics.Sales. Every column
/// comes from <see cref="SalesModel"/>, every value travels as a query parameter; EF Core writes
/// the SQL.
/// </summary>
public sealed class SalesAggregator(AnalyticsContext db)
{
    public const int MaxGroupBy = 3;
    public const int MaxFilters = 10;
    public const int DefaultLimit = 100;
    public const int MaxLimit = 1000;

    public async Task<AggregateResponse> AggregateAsync(AggregateRequest request, CancellationToken cancellationToken)
    {
        var measures = ResolveMeasures(request.Measures);
        var dimensions = ResolveDimensions(request.GroupBy);
        var limit = request.Limit ?? DefaultLimit;
        if (limit is < 1 or > MaxLimit)
        {
            throw new InvalidQueryException($"limit must be between 1 and {MaxLimit}.");
        }

        if ((request.Filters?.Count ?? 0) > MaxFilters)
        {
            throw new InvalidQueryException($"At most {MaxFilters} filters are allowed.");
        }
        var filtered = db.Sales.AsQueryable();
        foreach (var filter in request.Filters ?? [])
        {
            filtered = filtered.Where(BuildFilter(filter));
        }

        var groups = dimensions.Count == 0
            ? filtered.GroupBy(_ => new GroupKey { I0 = 0 })
            : filtered.GroupBy(BuildKeySelector(dimensions));

        var grouped = groups
            .Select(g => new GroupRow
            {
                Key = g.Key,
                Revenue = Math.Round(g.Sum(s => s.SalesAmount) ?? 0m, 2),
                Cost = Math.Round(g.Sum(s => s.TotalProductCost) ?? 0m, 2),
                Margin = Math.Round((g.Sum(s => s.SalesAmount) ?? 0m) - (g.Sum(s => s.TotalProductCost) ?? 0m), 2),
                Quantity = g.Sum(s => (int?)s.OrderQuantity) ?? 0,
                Orders = g.Select(s => s.SalesOrderNumber).Distinct().Count(),
            });

        var rows = await ApplyOrder(grouped, request.OrderBy, dimensions, measures)
            .Take(limit + 1)
            .ToListAsync(cancellationToken);

        var truncated = rows.Count > limit;
        var result = rows.Take(limit).Select(row => ToDictionary(row, dimensions, measures)).ToList();

        var columns = dimensions.Select(d => new ColumnDescription(d.Name, "dimension", null))
            .Concat(measures.Select(m => new ColumnDescription(m.Name, "measure", m.Unit)))
            .ToList();

        return new AggregateResponse(columns, result, result.Count, truncated);
    }

    private static List<MeasureDefinition> ResolveMeasures(IReadOnlyList<string>? names)
    {
        if (names is null || names.Count == 0)
        {
            throw new InvalidQueryException($"Request at least one measure: {string.Join(", ", SalesModel.Measures.Select(m => m.Name))}.");
        }
        return names.Distinct().Select(name => SalesModel.FindMeasure(name)
            ?? throw new InvalidQueryException($"Unknown measure '{name}'. Allowed: {string.Join(", ", SalesModel.Measures.Select(m => m.Name))}.")).ToList();
    }

    private static List<DimensionDefinition> ResolveDimensions(IReadOnlyList<string>? names)
    {
        names ??= [];
        if (names.Count > MaxGroupBy)
        {
            throw new InvalidQueryException($"Group by at most {MaxGroupBy} dimensions.");
        }
        return names.Distinct().Select(FindDimensionOrThrow).ToList();
    }

    private static DimensionDefinition FindDimensionOrThrow(string name) =>
        SalesModel.FindDimension(name)
        ?? throw new InvalidQueryException($"Unknown dimension '{name}'. Allowed: {string.Join(", ", SalesModel.Dimensions.Select(d => d.Name))}.");

    /// <summary>s => new GroupKey { I0 = s.OrderYear, S1 = s.SalesTerritoryCountry, ... }</summary>
    private static Expression<Func<Sale, GroupKey>> BuildKeySelector(IReadOnlyList<DimensionDefinition> dimensions)
    {
        var sale = Expression.Parameter(typeof(Sale), "s");
        var bindings = dimensions.Select((dimension, index) =>
        {
            var value = Rebind(dimension.Selector, sale);
            return dimension.IsNumeric
                ? Expression.Bind(KeyProperty("I", index), Expression.Convert(value, typeof(int?)))
                : Expression.Bind(KeyProperty("S", index), value);
        });
        return Expression.Lambda<Func<Sale, GroupKey>>(Expression.MemberInit(Expression.New(typeof(GroupKey)), bindings), sale);
    }

    private static Expression<Func<Sale, bool>> BuildFilter(FilterRequest filter)
    {
        var dimension = FindDimensionOrThrow(filter.Dimension);
        var sale = Expression.Parameter(typeof(Sale), "s");
        var value = Rebind(dimension.Selector, sale);

        if (filter.Values is null || filter.Values.Count == 0)
        {
            throw new InvalidQueryException($"Filter on '{dimension.Name}' needs at least one value.");
        }

        Expression body = filter.Operator switch
        {
            "eq" when filter.Values.Count == 1 => dimension.IsNumeric
                ? Expression.Equal(value, Parameter(ReadInt(dimension, filter.Values[0])))
                : Expression.Equal(value, Parameter<string?>(ReadText(dimension, filter.Values[0]))),
            "in" => dimension.IsNumeric
                ? Contains(filter.Values.Select(v => ReadInt(dimension, v)).ToList(), value)
                : Contains(filter.Values.Select(v => (string?)ReadText(dimension, v)).ToList(), value),
            "gte" when dimension.IsNumeric && filter.Values.Count == 1 =>
                Expression.GreaterThanOrEqual(value, Parameter(ReadInt(dimension, filter.Values[0]))),
            "lte" when dimension.IsNumeric && filter.Values.Count == 1 =>
                Expression.LessThanOrEqual(value, Parameter(ReadInt(dimension, filter.Values[0]))),
            _ => throw new InvalidQueryException(
                $"Operator '{filter.Operator}' does not fit dimension '{dimension.Name}'. Use eq (one value) or in (several values)"
                + (dimension.IsNumeric ? ", or gte/lte (one value)." : ".")),
        };
        return Expression.Lambda<Func<Sale, bool>>(body, sale);
    }

    private static IQueryable<GroupRow> ApplyOrder(
        IQueryable<GroupRow> rows,
        OrderByRequest? orderBy,
        IReadOnlyList<DimensionDefinition> dimensions,
        IReadOnlyList<MeasureDefinition> measures)
    {
        IOrderedQueryable<GroupRow>? ordered = null;

        if (orderBy is not null)
        {
            var descending = orderBy.Direction switch
            {
                null or "asc" => false,
                "desc" => true,
                _ => throw new InvalidQueryException("orderBy.direction must be 'asc' or 'desc'."),
            };
            var index = dimensions.ToList().FindIndex(d => d.Name == orderBy.Field);
            if (index >= 0)
            {
                ordered = OrderByDimension(rows, ordered, dimensions[index], index, descending);
            }
            else if (measures.Any(m => m.Name == orderBy.Field))
            {
                ordered = OrderByMeasure(rows, ordered, orderBy.Field, descending);
            }
            else
            {
                throw new InvalidQueryException($"orderBy.field '{orderBy.Field}' must be one of the requested dimensions or measures.");
            }
        }
        else if (!dimensions.Any(d => d.IsNumeric))
        {
            // Without a time dimension the largest groups come first; time series stay chronological.
            ordered = OrderByMeasure(rows, ordered, measures[0].Name, descending: true);
        }

        // Ties are broken by the grouping columns, so every backend returns the same order.
        for (var i = 0; i < dimensions.Count; i++)
        {
            ordered = OrderByDimension(rows, ordered, dimensions[i], i, descending: false);
        }

        return ordered ?? rows;
    }

    private static IOrderedQueryable<GroupRow> OrderByMeasure(
        IQueryable<GroupRow> rows, IOrderedQueryable<GroupRow>? ordered, string measure, bool descending) => measure switch
        {
            "revenue" => Order(rows, ordered, r => r.Revenue, descending),
            "cost" => Order(rows, ordered, r => r.Cost, descending),
            "margin" => Order(rows, ordered, r => r.Margin, descending),
            "quantity" => Order(rows, ordered, r => r.Quantity, descending),
            "orders" => Order(rows, ordered, r => r.Orders, descending),
            _ => throw new InvalidQueryException($"Unknown measure '{measure}'."),
        };

    private static IOrderedQueryable<GroupRow> OrderByDimension(
        IQueryable<GroupRow> rows, IOrderedQueryable<GroupRow>? ordered, DimensionDefinition dimension, int index, bool descending) =>
        (dimension.IsNumeric, index) switch
        {
            (true, 0) => Order(rows, ordered, r => r.Key.I0, descending),
            (true, 1) => Order(rows, ordered, r => r.Key.I1, descending),
            (true, _) => Order(rows, ordered, r => r.Key.I2, descending),
            (false, 0) => Order(rows, ordered, r => r.Key.S0, descending),
            (false, 1) => Order(rows, ordered, r => r.Key.S1, descending),
            (false, _) => Order(rows, ordered, r => r.Key.S2, descending),
        };

    private static IOrderedQueryable<GroupRow> Order<T>(
        IQueryable<GroupRow> rows, IOrderedQueryable<GroupRow>? ordered, Expression<Func<GroupRow, T>> key, bool descending) =>
        (ordered, descending) switch
        {
            (null, false) => rows.OrderBy(key),
            (null, true) => rows.OrderByDescending(key),
            (_, false) => ordered.ThenBy(key),
            (_, true) => ordered.ThenByDescending(key),
        };

    private static Dictionary<string, object?> ToDictionary(
        GroupRow row, IReadOnlyList<DimensionDefinition> dimensions, IReadOnlyList<MeasureDefinition> measures)
    {
        var result = new Dictionary<string, object?>();
        for (var i = 0; i < dimensions.Count; i++)
        {
            result[dimensions[i].Name] = (dimensions[i].IsNumeric, i) switch
            {
                (true, 0) => row.Key.I0,
                (true, 1) => row.Key.I1,
                (true, _) => row.Key.I2,
                (false, 0) => row.Key.S0,
                (false, 1) => row.Key.S1,
                (false, _) => row.Key.S2,
            };
        }
        foreach (var measure in measures)
        {
            // decimal.Round also drops the four-digit scale of SQL Server's money type: 12.50 instead of 12.5000.
            result[measure.Name] = measure.Name switch
            {
                "revenue" => decimal.Round(row.Revenue, 2),
                "cost" => decimal.Round(row.Cost, 2),
                "margin" => decimal.Round(row.Margin, 2),
                "quantity" => row.Quantity,
                _ => row.Orders,
            };
        }
        return result;
    }

    private static System.Reflection.PropertyInfo KeyProperty(string prefix, int index) =>
        typeof(GroupKey).GetProperty(prefix + index) ?? throw new InvalidOperationException($"GroupKey.{prefix}{index} is missing.");

    private static Expression Rebind(LambdaExpression selector, ParameterExpression parameter) =>
        new ReplaceParameter(selector.Parameters[0], parameter).Visit(selector.Body);

    /// <summary>Wraps the value in a closure, so EF Core sends it as a SQL parameter.</summary>
    private static Expression Parameter<T>(T value)
    {
        Expression<Func<T>> closure = () => value;
        return closure.Body;
    }

    private static Expression Contains<T>(List<T> values, Expression value) =>
        Expression.Call(typeof(Enumerable), nameof(Enumerable.Contains), [typeof(T)], Parameter(values), value);

    private static int ReadInt(DimensionDefinition dimension, JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)
            ? number
            : throw new InvalidQueryException($"Dimension '{dimension.Name}' expects whole numbers.");

    private static string ReadText(DimensionDefinition dimension, JsonElement value) =>
        value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : throw new InvalidQueryException($"Dimension '{dimension.Name}' expects text values.");

    private sealed class ReplaceParameter(ParameterExpression from, ParameterExpression to) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) => node == from ? to : node;
    }
}
