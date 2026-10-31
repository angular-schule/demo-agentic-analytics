FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
# The .NET CLI sends usage telemetry to Microsoft unless this is set.
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
WORKDIR /src
COPY global.json AgenticAnalytics.Api.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "AgenticAnalytics.Api.dll"]
