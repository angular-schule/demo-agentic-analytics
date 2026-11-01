using Microsoft.EntityFrameworkCore;

namespace AgenticAnalytics.Api.Data;

/// <summary>
/// Read-only access to the analytics views. The views have no keys and are never written,
/// so change tracking is off for every query.
/// </summary>
public sealed class AnalyticsContext(DbContextOptions<AnalyticsContext> options) : DbContext(options)
{
    public IQueryable<Sale> Sales => Set<Sale>();
    public IQueryable<Reseller> Resellers => Set<Reseller>();
    public IQueryable<Product> Products => Set<Product>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Sale>(e =>
        {
            e.ToView("AgentViewSales", "analytics").HasNoKey();
            e.Property(s => s.SalesAmount).HasColumnType("money");
            e.Property(s => s.TotalProductCost).HasColumnType("money");
        });

        modelBuilder.Entity<Reseller>(e =>
        {
            e.ToView("AgentViewResellers", "analytics").HasNoKey();
            e.Property(r => r.AnnualRevenue).HasColumnType("money");
        });

        modelBuilder.Entity<Product>(e =>
        {
            e.ToView("AgentViewProducts", "analytics").HasNoKey();
            e.Property(p => p.ListPrice).HasColumnType("money");
        });
    }
}
