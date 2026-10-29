using AgenticAnalytics.Api.Data;
using AgenticAnalytics.Api.Endpoints;
using AgenticAnalytics.Api.Semantic;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;

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
builder.Services.AddScoped<SchemaService>();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<InvalidQueryHandler>();
builder.Services.AddOpenApi();

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

var api = app.MapGroup("/api");
api.MapGet("/health", (DataScope s) => new { status = "ok", backend = "dotnet", database = "SQL Server", scope = s.TerritoryGroup });
api.MapGet("/schema", (SchemaService schema, CancellationToken ct) => schema.GetAsync(ct));
api.MapPost("/sales/aggregate", (SalesAggregator aggregator, AggregateRequest request, CancellationToken ct) => aggregator.AggregateAsync(request, ct));
api.MapCatalogEndpoints();

app.Run();

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
