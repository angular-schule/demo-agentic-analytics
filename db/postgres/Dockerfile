# PostgreSQL 17 with AdventureWorksDW, loaded from Microsoft's official CSV files on first start.
# The data is prepared in a separate stage, so the image holds one copy of the CSV files.
FROM postgres:17 AS data

# Pinned to one commit of microsoft/sql-server-samples (MIT licence) and verified by checksum.
ADD \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimDate.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimCurrency.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimSalesTerritory.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimGeography.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimProductCategory.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimProductSubcategory.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimProduct.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimPromotion.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimCustomer.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimEmployee.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/DimReseller.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/FactInternetSales.csv \
    https://raw.githubusercontent.com/microsoft/sql-server-samples/b47eadc85277f72843647223cde53aa1b85ffcb8/samples/databases/adventure-works/data-warehouse-install-script/FactResellerSales.csv \
    /aw-data/
COPY aw-data.sha256 /aw-data/

# DimProduct.csv marks empty mandatory text with NUL bytes, which PostgreSQL does not accept.
RUN cd /aw-data \
 && sha256sum --check --quiet aw-data.sha256 \
 && for f in *.csv; do tr -d '\000' < "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done \
 && chmod a+r /aw-data/*

FROM postgres:17
COPY --from=data /aw-data/ /aw-data/
COPY initdb/ /docker-entrypoint-initdb.d/
