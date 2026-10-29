using System.Data;
using System.Data.Common;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace AgenticAnalytics.Api.Data;

/// <summary>
/// Tells SQL Server which sales territory group this backend may see. The analytics views filter on
/// SESSION_CONTEXT(N'TerritoryGroup') and return nothing without it. Pooled connections are reset on
/// reuse, so the value is set on every open; read_only keeps later statements from changing it.
/// </summary>
public sealed class DataScopeInterceptor(string scope) : DbConnectionInterceptor
{
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var command = CreateCommand(connection);
        command.ExecuteNonQuery();
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection, ConnectionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        await using var command = CreateCommand(connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private DbCommand CreateCommand(DbConnection connection)
    {
        var command = connection.CreateCommand();
        command.CommandText = "EXEC sys.sp_set_session_context @key = N'TerritoryGroup', @value = @scope, @read_only = 1";
        command.Parameters.Add(new SqlParameter("@scope", SqlDbType.NVarChar, 50) { Value = scope });
        return command;
    }
}
