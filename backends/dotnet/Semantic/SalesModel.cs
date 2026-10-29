using System.Linq.Expressions;
using AgenticAnalytics.Api.Data;

namespace AgenticAnalytics.Api.Semantic;

/// <summary>A column the caller may group and filter by.</summary>
/// <param name="ListValues">Whether /api/schema lists the distinct values (only for small sets).</param>
public sealed record DimensionDefinition(
    string Name,
    string Label,
    string Description,
    bool IsNumeric,
    bool ListValues,
    LambdaExpression Selector);

/// <summary>An aggregate the caller may request.</summary>
public sealed record MeasureDefinition(string Name, string Label, string Description, string? Unit);

/// <summary>
/// The semantic layer over analytics.Sales: the complete list of dimensions and measures a caller
/// (in the end, a language model) may use. Names outside these lists are rejected, so no request
/// can reach a column that is not listed here.
/// </summary>
public static class SalesModel
{
    public static readonly IReadOnlyList<DimensionDefinition> Dimensions =
    [
        Numeric("year", "Order year", "Calendar year of the order date.", s => s.OrderYear),
        Numeric("quarter", "Order quarter", "Calendar quarter of the order date (1 to 4).", s => s.OrderQuarter),
        Numeric("month", "Order month", "Calendar month of the order date (1 to 12).", s => s.OrderMonth),
        Text("channel", "Sales channel", "'Online' for direct sales to consumers, 'Reseller' for sales to bike shops and other companies.", s => s.Channel, listValues: true),
        Text("productCategory", "Product category", "Top-level product category.", s => s.ProductCategory, listValues: true),
        Text("productSubcategory", "Product subcategory", "Product subcategory, e.g. 'Mountain Bikes'.", s => s.ProductSubcategory, listValues: true),
        Text("product", "Product", "Product name including size and colour variant.", s => s.ProductName, listValues: false),
        Text("territoryGroup", "Territory group", "Sales territory group (continent level).", s => s.SalesTerritoryGroup, listValues: true),
        Text("country", "Country", "Country of the sales territory.", s => s.SalesTerritoryCountry, listValues: true),
        Text("region", "Region", "Sales territory region. The United States is split into five regions, every other country is one region.", s => s.SalesTerritoryRegion, listValues: true),
        Text("reseller", "Reseller", "Name of the reseller company. Empty for online sales.", s => s.ResellerName, listValues: false),
        Text("resellerBusinessType", "Reseller business type", "Kind of reseller. Empty for online sales.", s => s.ResellerBusinessType, listValues: true),
    ];

    public static readonly IReadOnlyList<MeasureDefinition> Measures =
    [
        new("revenue", "Revenue", "Sum of the sales amount.", "USD"),
        new("cost", "Product cost", "Sum of the standard cost of the products sold.", "USD"),
        new("margin", "Gross margin", "Revenue minus product cost.", "USD"),
        new("quantity", "Units sold", "Number of units sold.", null),
        new("orders", "Orders", "Number of distinct sales orders.", null),
    ];

    public static DimensionDefinition? FindDimension(string name) =>
        Dimensions.FirstOrDefault(d => d.Name == name);

    public static MeasureDefinition? FindMeasure(string name) =>
        Measures.FirstOrDefault(m => m.Name == name);

    private static DimensionDefinition Numeric(string name, string label, string description, Expression<Func<Sale, int>> selector) =>
        new(name, label, description, IsNumeric: true, ListValues: true, selector);

    private static DimensionDefinition Text(string name, string label, string description, Expression<Func<Sale, string?>> selector, bool listValues) =>
        new(name, label, description, IsNumeric: false, listValues, selector);
}
