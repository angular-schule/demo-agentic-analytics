using System.Text.Json;

namespace AgenticAnalytics.Api.Semantic;

/// <summary>Request body of POST /api/sales/aggregate.</summary>
public sealed record AggregateRequest(
    IReadOnlyList<string>? Measures,
    IReadOnlyList<string>? GroupBy,
    IReadOnlyList<FilterRequest>? Filters,
    OrderByRequest? OrderBy,
    int? Limit);

/// <param name="Operator">eq, in, gte or lte. gte and lte only for numeric dimensions.</param>
public sealed record FilterRequest(string Dimension, string Operator, IReadOnlyList<JsonElement> Values);

/// <param name="Direction">asc or desc.</param>
public sealed record OrderByRequest(string Field, string? Direction);

public sealed record ColumnDescription(string Name, string Kind, string? Unit);

public sealed record AggregateResponse(
    IReadOnlyList<ColumnDescription> Columns,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows,
    int RowCount,
    bool Truncated);

/// <summary>A request that does not fit the semantic layer. The message names the allowed values.</summary>
public sealed class InvalidQueryException(string message) : Exception(message);
