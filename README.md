# Agentic Analytics with Angular

Ask a sales database questions in plain language and get charts back, right inside an Angular app.
Pin the answers you like to a dashboard that keeps working without the language model.

The demo accompanies the article **[Agentic Analytics with Angular, CopilotKit and Mastra](https://angular.schule/blog/2026-11-agentic-analytics)** on angular.schule.
It was inspired by Manfred Steyer's live-coding workshop *Build an Agentic Analytics App with Angular* ([his demo](https://github.com/manfredsteyer/agentic-sales)) and rebuilt with its own data, its own backends and a strong focus on data protection.

![The app: chat on the left, pinned dashboard on the right](docs/screenshot.png)

## What it shows

- **Generative UI with Angular and CopilotKit.** The agent's tool calls are rendered as Angular components: line, bar and stat charts, tables, and product cards with photos.
- **AG-UI** as the protocol between the Angular app and the agent, streamed as server-sent events.
- **A Mastra agent** whose tools are generated from the semantic layer of the data backend, so the model only knows names that really exist.
- **A semantic layer instead of SQL.** The model chooses measures, dimensions and filters. It never writes SQL; the backends validate every request and pass values as parameters.
- **Data minimisation.** Company names are part of the data, people are not: no sales representatives, key account managers or contact persons. The database account of the backends can only read three views that contain no personal data, filtered to a configurable territory.
- **Two interchangeable data backends** with the same HTTP contract and the same AdventureWorks data: ASP.NET Core with Entity Framework Core and SQL Server, or NestJS with Drizzle and PostgreSQL. Contract tests make sure both give identical answers.
- **A dashboard without tokens.** A pinned view stores the query, not the numbers. Tiles ask the data backend directly.

## Architecture

```
Browser (Angular + CopilotKit)
  │  /agent  AG-UI over SSE            /api  pinned tiles, product photos
  ▼                                     ▼
Agent (Mastra, Node.js) ── /api ──▶ Data backend (one of)
  │                                   ├─ ASP.NET Core + EF Core ─▶ SQL Server 2025
  ▼                                   └─ NestJS + Drizzle ───────▶ PostgreSQL 17
LLM provider (Anthropic, OpenAI or Google)
```

| Folder | Content |
| --- | --- |
| `frontend/` | Angular app with CopilotKit, served by nginx in the container |
| `agent/` | Mastra agent with an AG-UI endpoint |
| `backends/dotnet/` | ASP.NET Core minimal API, EF Core, SQL Server |
| `backends/node/` | NestJS on Fastify, Drizzle, postgres.js |
| `db/` | Database images: import of AdventureWorksDW, analytics views, read-only role |
| `contract/` | Tests that send the same requests to both backends and compare the answers |

## Quick start

Requirements: Docker with Compose, and an API key of an LLM provider.

```bash
cp .env.example .env              # database passwords and the data scope
cp agent/.env.example agent/.env  # model and API key

docker compose --profile node up --build     # NestJS + PostgreSQL
# or
docker compose --profile dotnet up --build   # ASP.NET Core + SQL Server
```

Then open <http://localhost:8080>.
The first start imports the AdventureWorks data and takes a few minutes.
SQL Server is published for amd64 only; on Apple Silicon it runs emulated and needs about 2 GB of memory for the Docker VM.

### Switching the model

The agent uses Mastra's model router: set `MODEL` in `agent/.env` to `provider/model` and add the provider's key.

```bash
MODEL=anthropic/claude-sonnet-5-5   # ANTHROPIC_API_KEY
MODEL=openai/gpt-5.6-terra          # OPENAI_API_KEY
MODEL=google/gemini-3-flash-preview # GOOGLE_GENERATIVE_AI_API_KEY
```

### Restricting the data

`DATA_SCOPE` in `.env` limits what the backends may see: `*` for everything, or one territory group (`Europe`, `North America`, `Pacific`).
The restriction is enforced in the database: the views filter by a session value that the backend sets for every connection (read-only session context in SQL Server, a connection parameter in PostgreSQL). Without that value the views return no rows.

## Development without Docker

Each part can run on its own, against databases started with Compose:

```bash
docker compose --profile node up postgres

cd backends/node && npm ci && npm run build && \
  DATABASE_URL=postgres://analytics_reader:<password>@127.0.0.1:5434/adventureworks PORT=8082 npm start

cd agent && npm ci && DATA_API_URL=http://127.0.0.1:8082 npm start

cd frontend && npm ci && DATA_API_URL=http://127.0.0.1:8082 npm start   # http://localhost:4200
```

With both backends running (.NET on 8081, Node on 8082), the contract tests compare them:

```bash
node --test 'contract/*.test.mjs'
```

## Data

The data is **AdventureWorksDW** by Microsoft, from [microsoft/sql-server-samples](https://github.com/microsoft/sql-server-samples), MIT License: sales of a fictitious bicycle manufacturer between December 2010 and January 2014.
SQL Server restores the original backup; PostgreSQL imports the CSV files of the same release.
Downloads are pinned to a commit and checked against SHA-256 checksums.

## Privacy notes

- The browser talks to one origin only. The app loads no fonts, scripts or telemetry from third parties.
- Mastra sends usage telemetry by default; the agent switches it off (`MASTRA_TELEMETRY_DISABLED`).
- The CopilotKit Inspector, which reports usage when opened, is disabled.
- Whatever a tool returns goes to the LLM provider. That is why the semantic layer contains no personal data in the first place.
