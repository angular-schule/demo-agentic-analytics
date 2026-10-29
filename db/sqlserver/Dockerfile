# SQL Server 2025 with AdventureWorksDW, restored from Microsoft's official backup on first start.
FROM mcr.microsoft.com/mssql/server:2025-latest

# Microsoft's backup from the sql-server-samples release (MIT licence), verified by checksum.
ADD --chown=10001:0 \
    https://github.com/microsoft/sql-server-samples/releases/download/adventureworks/AdventureWorksDW2025.bak \
    /opt/adventureworks/
RUN echo "358ba9591bc825b89868c532dcf427e888654bbbf42de851bff2fd2937ccbd97  /opt/adventureworks/AdventureWorksDW2025.bak" \
    | sha256sum --check --quiet

COPY --chown=10001:0 --chmod=755 init/ /opt/adventureworks/

ENTRYPOINT ["/opt/adventureworks/entrypoint.sh"]
