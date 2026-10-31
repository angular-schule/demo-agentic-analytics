using System.Text.Json;
using System.Text.Json.Serialization;
using AgenticAnalytics.Api.Agent;
using AgenticAnalytics.Api.Data;
using AgenticAnalytics.Api.Debug;
using AgenticAnalytics.Api.Endpoints;
using AgenticAnalytics.Api.Semantic;
using System.ClientModel;
using System.ClientModel.Primitives;
using Anthropic;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.OpenApi;
using OpenAI;

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
    // DEBUG ONLY: records the traffic to the LLM provider for the demo's traffic window (DEBUG_TRAFFIC=off switches it off).
    var debugTraffic = LlmTrafficLog.Enabled(app.Configuration);
    var trafficLog = new LlmTrafficLog();
    var recorder = debugTraffic ? new LlmTrafficHandler(trafficLog) : null;
    var chatClient = model.Provider == "anthropic" ? AnthropicChatClient(model, recorder) : OpenAIChatClient(model, recorder);
    var analyst = AnalystAgent.Create(chatClient, schema, app.Services.GetRequiredService<IServiceScopeFactory>(), app.Logger);
    app.MapAGUIServer($"/agent/ag-ui/{AnalystAgent.Id}", analyst).ExcludeFromDescription();
    app.MapGet("/agent/info", () => new { framework = "Microsoft Agent Framework", model = model.Id, debugTraffic }).ExcludeFromDescription();
    if (debugTraffic)
    {
        app.MapGet("/agent/debug/llm", (CancellationToken ct) => TypedResults.ServerSentEvents(trafficLog.Watch(ct))).ExcludeFromDescription();
    }
}

app.Run();

// The Anthropic adapter limits answers to 1024 tokens unless the request sets a limit. Mastra's
// ANTHROPIC_BASE_URL ends in /v1, Anthropic's .NET SDK adds it itself.
static IChatClient AnthropicChatClient(ModelSettings model, DelegatingHandler? recorder) =>
    new AnthropicClient
    {
        ApiKey = model.ApiKey,
        BaseUrl = model.BaseUrl.EndsWith("/v1", StringComparison.Ordinal) ? model.BaseUrl[..^3] : model.BaseUrl,
        Handlers = recorder is null ? [] : [recorder],
    }
        .AsIChatClient(model.Name)
        .AsBuilder()
        .ConfigureOptions(options => options.MaxOutputTokens ??= 8192)
        .Build();

// OpenAI, and Gemini and Mistral through their OpenAI-compatible endpoints: OpenAI's SDK talks to all three.
static IChatClient OpenAIChatClient(ModelSettings model, DelegatingHandler? recorder)
{
    var options = new OpenAIClientOptions { Endpoint = new Uri(model.BaseUrl) };
    if (recorder is not null)
    {
        recorder.InnerHandler = new HttpClientHandler();
        options.Transport = new HttpClientPipelineTransport(new HttpClient(recorder) { Timeout = Timeout.InfiniteTimeSpan });
    }
    return new OpenAIClient(new ApiKeyCredential(model.ApiKey), options).GetChatClient(model.Name).AsIChatClient();
}

/// <param name="Id">As in the Mastra agent: provider, slash, model, e.g. anthropic/claude-sonnet-5-5 or mistral/mistral-large-latest.</param>
/// <param name="BaseUrl">The provider's API; the variables are the ones Mastra reads, so both tracks share agent/.env.</param>
internal sealed record ModelSettings(string Id, string Provider, string Name, string ApiKey, string BaseUrl)
{
    private sealed record ProviderInfo(string ApiKey, string BaseUrlVariable, string DefaultBaseUrl, string Suffix = "");

    private static readonly Dictionary<string, ProviderInfo> Providers = new()
    {
        ["anthropic"] = new("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1"),
        ["openai"] = new("OPENAI_API_KEY", "OPENAI_BASE_URL", "https://api.openai.com/v1"),
        // GOOGLE_BASE_URL is the address of the Gemini API, as for Mastra; its OpenAI-compatible endpoint is below it.
        ["google"] = new("GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_BASE_URL", "https://generativelanguage.googleapis.com/v1beta", "/openai"),
        ["mistral"] = new("MISTRAL_API_KEY", "MISTRAL_BASE_URL", "https://api.mistral.ai/v1"),
    };

    public static ModelSettings? Read(IConfiguration configuration, out string reason)
    {
        var id = configuration["MODEL"] ?? "anthropic/claude-sonnet-5-5";
        reason = "";
        var name = id.Split('/')[0];
        if (!Providers.TryGetValue(name, out var provider) || id.Length <= name.Length + 1)
        {
            reason = $"MODEL '{id}' names no known provider: anthropic, openai, google or mistral.";
            return null;
        }
        if (configuration[provider.ApiKey] is not { Length: > 0 } apiKey)
        {
            reason = $"{provider.ApiKey} is not set.";
            return null;
        }
        var baseUrl = configuration[provider.BaseUrlVariable] is { Length: > 0 } url ? url : provider.DefaultBaseUrl;
        return new ModelSettings(id, name, id[(name.Length + 1)..], apiKey, baseUrl.TrimEnd('/') + provider.Suffix);
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
