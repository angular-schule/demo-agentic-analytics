namespace AgenticAnalytics.Api.Data;

/// <summary>The sales territory group this backend may see: '*' or one group name.</summary>
public sealed record DataScope(string TerritoryGroup)
{
    public static readonly IReadOnlyList<string> Allowed = ["*", "Europe", "North America", "Pacific"];

    public static DataScope Parse(string? value) =>
        value is not null && Allowed.Contains(value)
            ? new DataScope(value)
            : throw new InvalidOperationException($"DATA_SCOPE must be one of: {string.Join(", ", Allowed)}.");
}
