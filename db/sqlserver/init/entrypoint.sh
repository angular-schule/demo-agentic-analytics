#!/usr/bin/env bash
# Starts SQL Server and, on the first start of an empty data volume, restores Microsoft's
# AdventureWorksDW backup and creates the analytics schema and the read-only login.
set -euo pipefail

SQLCMD=(/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b)

/opt/mssql/bin/sqlservr &
server=$!

until "${SQLCMD[@]}" -Q "SELECT 1" >/dev/null 2>&1; do
  kill -0 "$server" || exit 1
  sleep 2
done

if [ "$("${SQLCMD[@]}" -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.databases WHERE name = N'AdventureWorksDW'")" = "0" ]; then
  echo "Restoring AdventureWorksDW ..."
  "${SQLCMD[@]}" -Q "RESTORE DATABASE AdventureWorksDW FROM DISK = N'/opt/adventureworks/AdventureWorksDW2025.bak'
    WITH MOVE N'AdventureWorksDW' TO N'/var/opt/mssql/data/AdventureWorksDW.mdf',
         MOVE N'AdventureWorksDW_log' TO N'/var/opt/mssql/data/AdventureWorksDW_log.ldf'"
  "${SQLCMD[@]}" -i /opt/adventureworks/10-analytics.sql -v ReaderPassword="$ANALYTICS_READER_PASSWORD"
  echo "AdventureWorksDW is ready."
fi

wait "$server"
