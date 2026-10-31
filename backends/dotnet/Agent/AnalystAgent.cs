using System.ComponentModel;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using AgenticAnalytics.Api.Data;
using AgenticAnalytics.Api.Endpoints;
using AgenticAnalytics.Api.Semantic;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

namespace AgenticAnalytics.Api.Agent;

[JsonConverter(typeof(JsonStringEnumConverter<ChartKind>))]
public enum ChartKind
{
    [JsonStringEnumMemberName("bar")] Bar,
    [JsonStringEnumMemberName("line")] Line,
    [JsonStringEnumMemberName("table")] Table,
    [JsonStringEnumMemberName("kpi")] Kpi,
}

/// <summary>What a tool answers when the request was rejected or the database failed.</summary>
public sealed record ToolError(string Error);

/// <summary>
/// The sales analyst, built with the Microsoft Agent Framework: the same system prompt and the same
/// two tools as the Mastra agent, so the Angular app draws both alike. The tools call the semantic
/// layer in this process; the model only sees what the views and the semantic layer let through.
/// </summary>
public static class AnalystAgent
{
    public const string Id = "analyst";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        NumberHandling = JsonNumberHandling.Strict,
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
    };

    public static AIAgent Create(IChatClient model, SchemaResponse schema, IServiceScopeFactory scopes, ILogger logger)
    {
        var schemaOptions = new AIJsonSchemaCreateOptions { TransformSchemaNode = (context, node) => Describe(schema, context, node) };
        // Tool results go to the model as compact JSON strings. Left as objects, the Anthropic adapter writes
        // them with the indented default options of Microsoft.Extensions.AI.
        AIFunctionFactoryOptions Tool(string name) => new()
        {
            Name = name,
            SerializerOptions = Json,
            JsonSchemaCreateOptions = schemaOptions,
            MarshalResult = (result, type, _) => new(JsonSerializer.Serialize(result, type ?? typeof(object), Json)),
        };

        [Description("""
            Aggregates the sales data and shows the result to the user as a chart, table or key figure.
            The user sees the visualization right away, so do not repeat the numbers as a table in the answer;
            comment on what stands out instead.
            Put the measure the title is about first: charts plot the first measure, plus further
            measures with the same unit side by side when there is no second dimension.
            Choose the visualization: "line" for a time series (group by year, quarter or month),
            "bar" to compare categories, "kpi" for a single total without groupBy, "table" for three
            dimensions or long lists.
            """)]
        async Task<object> QuerySales(
            [Description("Short title for the visualization, e.g. \"Revenue per year and channel\".")] string title,
            ChartKind chart,
            AggregateRequest query,
            CancellationToken ct) =>
            await OrError(logger, async () =>
            {
                await using var scope = scopes.CreateAsyncScope();
                return await scope.ServiceProvider.GetRequiredService<SalesAggregator>().AggregateAsync(query, ct);
            });

        [Description("""
            Searches the product catalogue by name and shows the products to the user as cards with photo.
            Use it when the user asks what a product looks like or which variants exist. To get sales
            figures of products, use querySales with the dimension "product".
            """)]
        async Task<object> FindProducts(
            [Description("Part of the product name, e.g. \"Mountain-200\" or \"helmet\".")] string search,
            [Description("Between 1 and 24. Default 8.")] int? limit,
            CancellationToken ct) =>
            await OrError(logger, async () =>
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AnalyticsContext>();
                return new { products = await CatalogEndpoints.SearchProductsAsync(db, search, null, Math.Clamp(limit ?? 8, 1, 24), ct) };
            });

        AITool[] tools =
        [
            AIFunctionFactory.Create(QuerySales, Tool("querySales")),
            AIFunctionFactory.Create(FindProducts, Tool("findProducts")),
        ];
        return model.AsAIAgent(name: Id, instructions: Instructions(schema), tools: tools);
    }

    /// <summary>
    /// Every failure becomes a tool result: the model can correct a rejected request, and the chat card
    /// shows the message instead of waiting.
    /// </summary>
    private static async Task<object> OrError(ILogger logger, Func<Task<object>> call)
    {
        try
        {
            return await call();
        }
        catch (InvalidQueryException error)
        {
            return new ToolError(error.Message);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogError(error, "Tool call failed.");
            return new ToolError("The database is not reachable.");
        }
    }

    /// <summary>
    /// The parameter schema the model sees: dimension and measure names become enums, so the model
    /// sees exactly the names that exist. The semantic layer checks every request again.
    /// Optional fields are left out rather than sent as null, as with the Mastra agent's Zod schema:
    /// a query the model writes is also a dashboard tile and the argument of pinToDashboard.
    /// </summary>
    private static JsonNode Describe(SchemaResponse schema, AIJsonSchemaCreateContext context, JsonNode node)
    {
        if (context.DeclaringType == typeof(AggregateRequest) || context.DeclaringType == typeof(OrderByRequest))
        {
            OmitNull(node);
        }
        if (context.PropertyInfo is null && context.TypeInfo.Type == typeof(AggregateRequest))
        {
            node["required"] = new JsonArray("measures");
        }
        var dimensions = new JsonArray([.. schema.Dimensions.Select(d => JsonValue.Create(d.Name))]);
        var measures = new JsonArray([.. schema.Measures.Select(m => JsonValue.Create(m.Name))]);
        var limits = schema.Limits;
        switch (context.DeclaringType?.Name, context.PropertyInfo?.Name)
        {
            case (nameof(AggregateRequest), "measures"):
                node["items"] = new JsonObject { ["type"] = "string", ["enum"] = measures };
                node["minItems"] = 1;
                node["description"] = "Measures to compute.";
                break;
            case (nameof(AggregateRequest), "groupBy"):
                node["items"] = new JsonObject { ["type"] = "string", ["enum"] = dimensions };
                node["maxItems"] = limits.MaxGroupBy;
                node["description"] = $"Up to {limits.MaxGroupBy} dimensions to group by. Omit for a grand total.";
                break;
            case (nameof(AggregateRequest), "filters"):
                node["maxItems"] = limits.MaxFilters;
                node["description"] = "All filters must match. Text values must match the listed values exactly.";
                break;
            case (nameof(AggregateRequest), "orderBy"):
                node["description"] = "Default: largest first, time series chronologically.";
                break;
            case (nameof(AggregateRequest), "limit"):
                node["minimum"] = 1;
                node["maximum"] = limits.MaxLimit;
                node["description"] = $"Default {limits.DefaultLimit}.";
                break;
            case (nameof(FilterRequest), "dimension"):
                node["enum"] = dimensions;
                break;
            case (nameof(FilterRequest), "operator"):
                node["enum"] = new JsonArray("eq", "in", "gte", "lte");
                node["description"] = "eq and gte/lte take one value, in takes several.";
                break;
            case (nameof(FilterRequest), "values"):
                node["items"] = new JsonObject { ["type"] = new JsonArray("string", "number") };
                node["minItems"] = 1;
                break;
            case (nameof(OrderByRequest), "field"):
                node["description"] = "A requested dimension or measure.";
                break;
            case (nameof(OrderByRequest), "direction"):
                node["enum"] = new JsonArray("asc", "desc");
                break;
        }
        return node;
    }

    private static void OmitNull(JsonNode node)
    {
        if (node["type"] is JsonArray types)
        {
            var nonNull = types.Select(t => t?.GetValue<string>()).Where(t => t != "null").ToList();
            node["type"] = nonNull.Count == 1 ? nonNull[0] : new JsonArray([.. nonNull.Select(t => JsonValue.Create(t))]);
        }
        node.AsObject().Remove("default");
    }

    /// <summary>The system prompt: role, rules, and the semantic layer with every value a filter may use.</summary>
    private static string Instructions(SchemaResponse schema)
    {
        var dataset = schema.Dataset;
        var dimensions = string.Join('\n', schema.Dimensions.Select(d =>
        {
            var values = d.Values is null ? "" : $" Values: {string.Join(", ", d.Values.Select(v => JsonSerializer.Serialize(v)))}.";
            return $"- {d.Name} ({d.Type}): {d.Description}{values}";
        }));
        var measures = string.Join('\n', schema.Measures.Select(m => $"- {m.Name}{(m.Unit is null ? "" : $" ({m.Unit})")}: {m.Description}"));
        var from = dataset.From.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var to = dataset.To.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        return $"""
            You are a sales analyst for Adventure Works Cycles, a bicycle manufacturer. You answer questions about
            its sales with the tools; never guess or invent numbers.

            ## Data
            {dataset.Description}
            Period: {from} to {to}. Currency: {dataset.Currency}.
            The data is restricted to the territory group "{dataset.Scope}" ("*" means all territories).

            Dimensions:
            {dimensions}

            Measures:
            {measures}

            ## Rules
            - Personal data is not part of the data model: no sales representatives or key account managers,
              no contact persons, no customers as persons. If asked, say that this data is deliberately not
              available to you and offer an analysis at company, product or region level instead.
            - Reseller names are company names and may be shown.
            - The first and last year are incomplete; say so when you compare years.
            - If a tool returns an error, correct the request and try again.
            - Keep answers short: the visualization speaks for itself.
            """;
    }
}
