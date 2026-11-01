using System.Linq.Expressions;
using System.Reflection;
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

/// <summary>One result row: the group key and the requested measures in M0..M4, in request order.</summary>
public sealed class GroupRow
{
    public GroupKey Key { get; init; } = new();
    public decimal M0 { get; init; }
    public decimal M1 { get; init; }
    public decimal M2 { get; init; }
    public decimal M3 { get; init; }
    public decimal M4 { get; init; }
}

/// <summary>
/// Turns an <see cref="AggregateRequest"/> into one LINQ query over analytics.AgentViewSales. Every column
/// comes from <see cref="SalesModel"/>, every value travels as a query parameter; EF Core writes
/// the SQL.
/// </summary>
public sealed class SalesAggregator(AnalyticsContext db)
{
    public const int MaxGroupBy = 3;
    public const int MaxFilters = 10;
    public const int DefaultLimit = 100;
    public const int MaxLimit = 1000;

    private static readonly string MeasureNames = string.Join(", ", SalesModel.Measures.Select(m => m.Name));
    private static readonly string DimensionNames = string.Join(", ", SalesModel.Dimensions.Select(d => d.Name));

    /// <summary>A slot of <see cref="GroupRow"/>: where to bind it, how to sort by it, how to read it from a loaded row.</summary>
    private sealed record Slot(PropertyInfo Property, LambdaExpression Member, Func<GroupRow, object?> Read);

    private static readonly Dictionary<string, Slot> Slots = new[] { "I0", "I1", "I2", "S0", "S1", "S2", "M0", "M1", "M2", "M3", "M4" }
        .ToDictionary(name => name, name =>
        {
            var owner = name.StartsWith('M') ? typeof(GroupRow) : typeof(GroupKey);
            var property = owner.GetProperty(name) ?? throw new InvalidOperationException($"{owner.Name}.{name} is missing.");
            var row = Expression.Parameter(typeof(GroupRow), "r");
            var member = Expression.Property(owner == typeof(GroupRow) ? row : Expression.Property(row, nameof(GroupRow.Key)), property);
            var read = Expression.Lambda<Func<GroupRow, object?>>(Expression.Convert(member, typeof(object)), row).Compile();
            return new Slot(property, Expression.Lambda(member, row), read);
        });

    private static Slot DimensionSlot(DimensionDefinition dimension, int index) => Slots[(dimension.IsNumeric ? "I" : "S") + index];

    private static Slot MeasureSlot(int index) => Slots["M" + index];

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

        var rows = await ApplyOrder(groups.Select(BuildRowSelector(measures)), request.OrderBy, dimensions, measures)
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
            throw new InvalidQueryException($"Request at least one measure: {MeasureNames}.");
        }
        return names.Distinct().Select(name => SalesModel.FindMeasure(name)
            ?? throw new InvalidQueryException($"Unknown measure '{name}'. Allowed: {MeasureNames}.")).ToList();
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
        ?? throw new InvalidQueryException($"Unknown dimension '{name}'. Allowed: {DimensionNames}.");

    /// <summary>s => new GroupKey { I0 = s.OrderYear, S1 = s.SalesTerritoryCountry, ... }</summary>
    private static Expression<Func<Sale, GroupKey>> BuildKeySelector(IReadOnlyList<DimensionDefinition> dimensions)
    {
        var sale = Expression.Parameter(typeof(Sale), "s");
        var bindings = dimensions.Select((dimension, index) =>
        {
            var value = Rebind(dimension.Selector, sale);
            return Expression.Bind(
                DimensionSlot(dimension, index).Property,
                dimension.IsNumeric ? Expression.Convert(value, typeof(int?)) : value);
        });
        return Expression.Lambda<Func<Sale, GroupKey>>(Expression.MemberInit(Expression.New(typeof(GroupKey)), bindings), sale);
    }

    /// <summary>g => new GroupRow { Key = g.Key, M0 = &lt;first measure&gt;, ... }: only the requested measures are computed.</summary>
    private static Expression<Func<IGrouping<GroupKey, Sale>, GroupRow>> BuildRowSelector(IReadOnlyList<MeasureDefinition> measures)
    {
        var group = Expression.Parameter(typeof(IGrouping<GroupKey, Sale>), "g");
        var key = Expression.Bind(
            typeof(GroupRow).GetProperty(nameof(GroupRow.Key)) ?? throw new InvalidOperationException("GroupRow.Key is missing."),
            Expression.Property(group, nameof(IGrouping<GroupKey, Sale>.Key)));
        var values = measures.Select((measure, index) => Expression.Bind(MeasureSlot(index).Property, Rebind(measure.Aggregate, group)));
        return Expression.Lambda<Func<IGrouping<GroupKey, Sale>, GroupRow>>(
            Expression.MemberInit(Expression.New(typeof(GroupRow)), values.Prepend(key)), group);
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
        var keys = new List<(Slot Slot, bool Descending)>();
        if (orderBy is not null)
        {
            var descending = orderBy.Direction switch
            {
                null or "asc" => false,
                "desc" => true,
                _ => throw new InvalidQueryException("orderBy.direction must be 'asc' or 'desc'."),
            };
            var dimension = dimensions.Select((d, i) => (Definition: d, Index: i)).FirstOrDefault(x => x.Definition.Name == orderBy.Field);
            var measure = measures.Select((m, i) => (Definition: m, Index: i)).FirstOrDefault(x => x.Definition.Name == orderBy.Field);
            var slot = dimension.Definition is not null ? DimensionSlot(dimension.Definition, dimension.Index)
                : measure.Definition is not null ? MeasureSlot(measure.Index)
                : throw new InvalidQueryException($"orderBy.field '{orderBy.Field}' must be one of the requested dimensions or measures.");
            keys.Add((slot, descending));
        }
        else if (!dimensions.Any(d => d.IsTime))
        {
            // Without a time dimension the largest groups come first; time series stay chronological.
            keys.Add((MeasureSlot(0), true));
        }

        // Ties are broken by the grouping columns, so every backend returns the same order.
        keys.AddRange(dimensions.Select((d, i) => (DimensionSlot(d, i), false)));

        for (var i = 0; i < keys.Count; i++)
        {
            var method = (i == 0, keys[i].Descending) switch
            {
                (true, false) => nameof(Queryable.OrderBy),
                (true, true) => nameof(Queryable.OrderByDescending),
                (false, false) => nameof(Queryable.ThenBy),
                (false, true) => nameof(Queryable.ThenByDescending),
            };
            var key = keys[i].Slot.Member;
            rows = rows.Provider.CreateQuery<GroupRow>(Expression.Call(
                typeof(Queryable), method, [typeof(GroupRow), key.ReturnType], rows.Expression, Expression.Quote(key)));
        }
        return rows;
    }

    private static Dictionary<string, object?> ToDictionary(
        GroupRow row, IReadOnlyList<DimensionDefinition> dimensions, IReadOnlyList<MeasureDefinition> measures)
    {
        var result = new Dictionary<string, object?>();
        for (var i = 0; i < dimensions.Count; i++)
        {
            result[dimensions[i].Name] = DimensionSlot(dimensions[i], i).Read(row);
        }
        for (var i = 0; i < measures.Count; i++)
        {
            // decimal.Round also drops the four-digit scale of SQL Server's money type: 12.50 instead of 12.5000.
            result[measures[i].Name] = MeasureSlot(i).Read(row) is decimal value ? decimal.Round(value, 2) : null;
        }
        return result;
    }

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
