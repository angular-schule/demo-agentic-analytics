using System.Text.Json;
using System.Text.Json.Serialization;
using AgenticAnalytics.Api.Agent;
using AgenticAnalytics.Api.Data;
using AgenticAnalytics.Api.Endpoints;
using AgenticAnalytics.Api.Semantic;
using Anthropic;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Analytics")
    ?? throw new InvalidOperationException("ConnectionStrings__Analytics is not set.");
var scope = DataScope.Parse(builder.Configuration["DATA_SCOPE"]);

builder.Services.AddSingleton(scope);
builder.Services.AddDbContext<AnalyticsContext>(options => options
    .UseSqlServer(connectionString)
    .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)
    .AddInterceptors(new DataScopeInterceptor(scope.TerritoryGroup)));
builder.Services.AddScoped<SalesAggregator>();
builder.Services.AddSingleton<SchemaService>();
builder.Services.AddProblemDetails();
builder.Services.AddAGUIServer();
builder.Services.AddExceptionHandler<InvalidQueryHandler>();
// Numbers are numbers: no "12" for 12, so the OpenAPI document says integer, not integer or string.
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info = new OpenApiInfo { Title = "Agentic Analytics data API", Version = "v1" };
        // Relative to wherever the document is served from, like the Node backend's document.
        document.Servers = [];
        return Task.CompletedTask;
    });
    // What the records cannot say by their types: a filter value is a string or a whole number,
    // operator and direction take fixed words. The aggregator checks all of it again.
    options.AddSchemaTransformer((schema, context, _) =>
    {
        var property = (context.JsonPropertyInfo?.DeclaringType, context.JsonPropertyInfo?.Name);
        if (property == (typeof(FilterRequest), "values"))
        {
            schema.Items = new OpenApiSchema { OneOf = [new OpenApiSchema { Type = JsonSchemaType.String }, new OpenApiSchema { Type = JsonSchemaType.Integer }] };
        }
        else if (property == (typeof(FilterRequest), "operator"))
        {
            schema.Enum = ["eq", "in", "gte", "lte"];
        }
        else if (property == (typeof(OrderByRequest), "direction"))
        {
            schema.Enum = ["asc", "desc"];
        }
        return Task.CompletedTask;
    });
});

var app = builder.Build();

// Set when the response starts, so error responses written by the exception handler carry it too.
app.Use((context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers["X-Data-Backend"] = "dotnet";
        return Task.CompletedTask;
    });
    return next(context);
});
app.UseExceptionHandler();
app.UseStatusCodePages();
app.MapOpenApi();
app.UseSwaggerUI(options =>
{
    options.DocumentTitle = "Agentic Analytics data API";
    options.SwaggerEndpoint("/openapi/v1.json", "Agentic Analytics data API");
});
app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();

var analytics = app.MapGroup("/api").WithTags("analytics");
analytics.MapGet("/health", (DataScope s) => new HealthResponse("ok", "dotnet", "SQL Server", s.TerritoryGroup));
analytics.MapGet("/schema", (SchemaService schema) => schema.GetAsync());
analytics.MapPost("/sales/aggregate", (SalesAggregator aggregator, AggregateRequest request, CancellationToken ct) => aggregator.AggregateAsync(request, ct))
    .ProducesProblem(StatusCodes.Status400BadRequest);
app.MapGroup("/api").WithTags("catalog").MapCatalogEndpoints();

// The agent runs in this process when a model is configured: AG-UI under /agent, like the separate
// Mastra service, so the Angular app does not notice which one answers.
var model = ModelSettings.Read(app.Configuration, out var reason);
if (model is null)
{
    app.Logger.LogWarning("The agent is not served by this backend: {Reason}", reason);
}
else
{
    var schema = await app.Services.GetRequiredService<SchemaService>().WaitForSchemaAsync(app.Logger);
    var chatClient = new AnthropicClient { ApiKey = model.ApiKey }.AsIChatClient(model.Name);
    var analyst = AnalystAgent.Create(chatClient, schema, app.Services.GetRequiredService<IServiceScopeFactory>(), app.Logger);
    app.MapAGUIServer($"/agent/ag-ui/{AnalystAgent.Id}", analyst).ExcludeFromDescription();
    app.MapGet("/agent/info", () => new { framework = "Microsoft Agent Framework", model = model.Id }).ExcludeFromDescription();
}

app.Run();

/// <param name="Id">As in the Mastra agent: provider, slash, model, e.g. anthropic/claude-sonnet-5-5.</param>
internal sealed record ModelSettings(string Id, string Name, string ApiKey)
{
    public static ModelSettings? Read(IConfiguration configuration, out string reason)
    {
        const string provider = "anthropic/";
        var id = configuration["MODEL"] ?? "anthropic/claude-sonnet-5-5";
        reason = "";
        if (!id.StartsWith(provider, StringComparison.Ordinal))
        {
            reason = $"MODEL '{id}' is not an Anthropic model; this backend talks to Anthropic only.";
            return null;
        }
        if (configuration["ANTHROPIC_API_KEY"] is not { Length: > 0 } apiKey)
        {
            reason = "ANTHROPIC_API_KEY is not set.";
            return null;
        }
        return new ModelSettings(id, id[provider.Length..], apiKey);
    }
}

internal sealed record HealthResponse(string Status, string Backend, string Database, string Scope);

/// <summary>Answers requests outside the semantic layer with 400 and a message naming the allowed values.</summary>
internal sealed class InvalidQueryHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not InvalidQueryException)
        {
            return false;
        }
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = { Status = 400, Title = "Invalid query", Detail = exception.Message },
        });
    }
}
