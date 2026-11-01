# Agentic Analytics with Angular

Ask a sales database questions in plain language and get charts back, right inside an Angular app.
Pin the answers you like to a dashboard that keeps working without the LLM.

The demo accompanies the article **[Agentic Analytics with Angular, CopilotKit and Mastra](https://angular.schule/blog/2026-11-agentic-analytics)** on angular.schule.
It was inspired by Manfred Steyer's live-coding workshop *Build an Agentic Analytics App with Angular* ([his demo](https://github.com/manfredsteyer/agentic-sales)) and rebuilt with its own data, its own backends and a strong focus on data protection.

![The app: chat on the left, pinned dashboard on the right](docs/screenshot.png)

## What it shows

- **Generative UI with Angular and CopilotKit.** The agent's tool calls are rendered as Angular components: line, bar and stat charts, tables, and product cards with photos.
- **AG-UI** as the protocol between the Angular app and the agent, streamed as server-sent events.
- **The same agent, built twice:** with Mastra (TypeScript) and with the Microsoft Agent Framework (C#). Same system prompt, same two tools, and the tool schemas are generated from the semantic layer, so the model only knows names that exist. The Angular app draws both alike.
- **The agent in the backend or as a separate service.** By default it runs in the backend's process: Mastra inside NestJS, the Microsoft Agent Framework inside ASP.NET Core. A separate Mastra service in front of either backend is one profile away.
- **A semantic layer instead of SQL.** The model chooses measures, dimensions and filters. It never writes SQL; the backends validate every request and pass values as parameters.
- **Data minimisation.** Company names are part of the data, people are not: no sales representatives, key account managers or contact persons. The database account of the backends can only read three views that contain no personal data, filtered to a configurable territory.
- **Two interchangeable backends** with the same HTTP contract and the same AdventureWorks data: ASP.NET Core with Entity Framework Core and SQL Server, or NestJS with Drizzle and PostgreSQL. Each generates its OpenAPI document from its own code and shows it in Swagger UI; contract tests make sure both documents describe the same contract and both backends give identical answers.
- **A dashboard without tokens.** A pinned view stores the query, not the numbers. Tiles ask the backend directly.
- **A traffic window for learning (debug feature).** Below the chat, the app shows every message on both lines: the AG-UI events between browser and agent, and the requests and streamed answers between agent and LLM provider. Nothing is hidden, so you can see exactly what the model gets.

## Architecture

Default: the agent runs in the backend.

```
Browser (Angular + CopilotKit)
  │  /agent  AG-UI over SSE    /api  pinned tiles, product photos
  ▼                            ▼
Backend (one of) ───────────────────────────────────▶ LLM provider
  ├─ ASP.NET Core + Microsoft Agent Framework + EF Core ─▶ SQL Server 2025
  └─ NestJS + Mastra + Drizzle ──────────────────────────▶ PostgreSQL 17
```

With the profile `agent`: a separate Mastra service between browser and backend.

```
Browser ── /agent ──▶ Agent (Mastra, Node.js) ── /api ──▶ Backend (one of)
   └────── /api ──────────────────────────────────────────▶
```

| Folder | Content |
| --- | --- |
| `frontend/` | Angular app with CopilotKit, served by nginx in the container |
| `agent/` | Mastra agent as a separate service with an AG-UI endpoint |
| `backends/dotnet/` | ASP.NET Core minimal API, EF Core, SQL Server; the agent with the Microsoft Agent Framework in `Agent/` |
| `backends/node/` | NestJS on Fastify, Drizzle, postgres.js; the agent with Mastra in `src/agent/` |
| `db/` | Database images: import of AdventureWorksDW, analytics views, read-only role |
| `contract/` | Tests that compare both backends and all agents, and the fake LLM they run against |
| `demo-model/` | A stand-in for an LLM provider without a language model, so the demo runs without an API key |
| `e2e/` | Browser tests with Playwright |

## Quick start

Requirements: Docker with Compose. An API key of an LLM provider is optional.

```bash
cp .env.example .env              # database passwords and DATA_SCOPE
cp agent/.env.example agent/.env  # model and API key; leave it out for the demo model

docker compose --profile node up --build     # NestJS + Mastra + PostgreSQL
# or
docker compose --profile dotnet up --build   # ASP.NET Core + Microsoft Agent Framework + SQL Server
```

The agent as a separate Mastra service, in front of either backend:

```bash
AGENT_URL=http://agent:4111 docker compose --profile node --profile agent up --build
```

Then open <http://localhost:8080>. The backend's Swagger UI opens at <http://localhost:8081> (.NET) or <http://localhost:8082> (Node).
The first start imports the AdventureWorks data and takes a few minutes.
SQL Server is published for amd64 only; on Apple Silicon it runs emulated and needs about 2 GB of memory for the Docker VM.

### The demo model (no LLM)

Without `agent/.env`, the agent talks to the demo model (`demo-model/`) instead of an LLM provider, so the app works without an API key and without cost.
The demo model is no language model. It looks for keywords in the question and maps them to the semantic layer, which it reads from the system prompt: measures and dimensions become `groupBy`, values from the data become filters, "top 10" sets order and limit, a product model or "look like" searches the catalogue, "pin" pins the last chart, questions about people get the refusal from the rules. Every answer starts with "Demo mode, no real LLM", and what it does not understand gets an honest "I cannot answer that" plus revenue per year.

It answers in OpenAI's formats, so every agent reaches it as an OpenAI model without any special code: `agent/demo.env` sets `MODEL=openai/demo-no-llm` and points `OPENAI_BASE_URL` at it. Compose loads `agent/.env` after that file, so a real model there wins.

### Switching the model

`agent/.env` configures the agent, wherever it runs. Set `MODEL` to `provider/model` and add the provider's key.
Both backends and the separate agent service support all providers below and read the same variables. Mastra uses its model router. The ASP.NET Core backend uses Anthropic's .NET SDK for Anthropic, and OpenAI's .NET SDK (through Microsoft.Extensions.AI.OpenAI) for OpenAI and for the OpenAI-compatible endpoints of Gemini and Mistral.

```bash
MODEL=anthropic/claude-sonnet-5-5     # ANTHROPIC_API_KEY
MODEL=openai/gpt-5.6-terra            # OPENAI_API_KEY, optional OPENAI_BASE_URL=https://eu.api.openai.com/v1 for processing in the EU
MODEL=google/gemini-3-flash-preview   # GOOGLE_GENERATIVE_AI_API_KEY
MODEL=mistral/mistral-large-latest    # MISTRAL_API_KEY, optional MISTRAL_BASE_URL=https://api.eu.mistral.ai/v1 for processing in the EU
```

### Restricting the data

`DATA_SCOPE` in `.env` limits what the backends may see: `*` for everything, or one territory group (`Europe`, `North America`, `Pacific`).
The restriction is enforced in the database: the views filter by a session value that the backend sets for every connection (read-only session context in SQL Server, a connection parameter in PostgreSQL). Without that value the views return no rows.

### The traffic window (debug feature)

The window is on by default, because the demo is meant for learning. It shows the whole conversation, every tool result and the system prompt to whoever opens the app, so **switch it off with `DEBUG_TRAFFIC=off` in `agent/.env`, and remove it from a production application.** Everything that belongs to it is marked `DEBUG ONLY`:

- **Browser ↔ agent:** `frontend/src/app/debug/`. The `HttpAgent` gets a `fetch` function that reads a copy of the AG-UI event stream.
- **Agent ↔ LLM provider, Node.js:** `llm-traffic.ts` in `backends/node/src/debug/` and `agent/src/`. A small proxy on a free port of 127.0.0.1 in the same process. Mastra's model router reads each provider's base URL from `<PROVIDER>_BASE_URL` (`ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `GOOGLE_BASE_URL`, `MISTRAL_BASE_URL`), so the proxy points these at itself and forwards to the address that was configured before.
- **Agent ↔ LLM provider, .NET:** `backends/dotnet/Debug/LlmTraffic.cs`. A `DelegatingHandler` in the HTTP pipeline of the Anthropic SDK (`Handlers` of the client) and of OpenAI's SDK (an `HttpClient` as its transport).
- Both serve the recorded exchanges as server-sent events under `/agent/debug/llm`. Headers, and with them the API key, are never recorded.

## Development without Docker

Each part can run on its own, against databases started with Compose:

```bash
docker compose --profile node up postgres

cd backends/node && npm ci && npm run build && \
  DATABASE_URL=postgres://analytics_reader:<password>@127.0.0.1:5434/adventureworks PORT=8082 npm start

cd frontend && npm ci && DATA_API_URL=http://127.0.0.1:8082 npm start   # http://localhost:4200
```

The backend reads `MODEL` and the API key from its environment. For the separate agent service instead:

```bash
cd agent && npm ci && DATA_API_URL=http://127.0.0.1:8082 npm start
cd frontend && DATA_API_URL=http://127.0.0.1:8082 AGENT_URL=http://127.0.0.1:4111 npm start
```

## Tests

The agents are tested against a fake LLM (`contract/fake-llm.mjs`) with scripted answers: no API key, no cost, the same result every time. It runs on the server of the demo model, which speaks Anthropic's Messages API and OpenAI's Chat Completions and Responses API. `compose.test.yaml` starts it and points every agent at it.

**Unit tests** need nothing running:

```bash
cd frontend && npm test   # Angular with Vitest: view schema, charts, dashboard, tool results, AG-UI recording
cd agent && npm test      # node:test: the traffic proxy (pass-through, recording without the API key, stop, DEBUG_TRAFFIC)
node --test 'demo-model/*.test.mjs'   # the demo model's keyword matching against the real system prompt
```

**Contract and agent tests** compare both backends and run every agent (ASP.NET Core, NestJS, the separate service, both backends once more with a Mistral model in OpenAI's Chat Completions format, and NestJS with an OpenAI model, which Mastra calls through the Responses API) through the same scenarios: tool calls whose result matches the API, the frontend tool, rejected requests, product search, what the model receives, that the provider is not asked to store the conversation, the traffic window and stopping a run. Both backends also answer the app's example questions with the demo model.

```bash
docker compose -f compose.yaml -f compose.test.yaml --profile dotnet --profile node --profile agent up -d --build
node --test 'contract/*.test.mjs'
```

**Browser tests** with Playwright drive the app on http://localhost:8080: chart, pinning by button and by chat, the dashboard after a reload without the model, product cards, the traffic window. They use the installed Google Chrome. Start one backend behind the web server (`--profile node` or `--profile dotnet`; add `--profile agent` and `AGENT_URL=http://agent:4111` for the separate agent service):

```bash
docker compose -f compose.yaml -f compose.test.yaml --profile node up -d --build
cd e2e && npm ci && npm test
```

Afterwards, `docker compose --profile node up -d` brings back the real model from `agent/.env`.

## Data

The data is **AdventureWorksDW** by Microsoft, from [microsoft/sql-server-samples](https://github.com/microsoft/sql-server-samples), MIT License: sales of a fictitious bicycle manufacturer between December 2010 and January 2014.
SQL Server restores the original backup; PostgreSQL imports the CSV files of the same release.
Downloads are pinned to a commit and checked against SHA-256 checksums.

## Privacy notes

- The browser talks to one origin only. The app loads no fonts, scripts or telemetry from third parties.
- Telemetry is switched off wherever the demo can switch it off:
  - Mastra sends usage telemetry to PostHog by default; the agent service and the NestJS backend set `MASTRA_TELEMETRY_DISABLED`.
  - The CopilotKit Inspector, which reports usage when opened, is disabled.
  - The .NET CLI reports usage during `dotnet restore` and `dotnet publish`; the Dockerfile sets `DOTNET_CLI_TELEMETRY_OPTOUT`.
  - `swagger-ui-dist` depends on `@scarf/scarf`, which reports installs from a `postinstall` script; `ignore-scripts=true` in every `.npmrc` keeps it from running. The NestJS Swagger page sets `validatorUrl: null`, so the OpenAPI URL never goes to validator.swagger.io; Swashbuckle does that by default.
  - The Angular CLI only collects usage data after an opt-in; `angular.json` sets `"analytics": false`.
  - SQL Server sends usage and diagnostic data to Microsoft, and the free Developer edition cannot switch it off. It holds only the sample data here; in production, use PostgreSQL or a paid edition with `telemetry.customerfeedback = false`.
- The Microsoft Agent Framework, Microsoft.Extensions.AI, the Anthropic SDK, AG-UI, NestJS, Drizzle, EF Core and PostgreSQL send nothing by themselves. Their OpenTelemetry support only exports where you configure it.
- Whatever a tool returns goes to the LLM provider. That is why the semantic layer contains no personal data in the first place.
- OpenAI's Responses API stores every response for at least 30 days unless the request sets `store: false`. Mastra uses this API for `openai/` models and sends no `store` field, so both Mastra agents set `store: false`. The ASP.NET Core backend uses Chat Completions, where storing is off by default.
