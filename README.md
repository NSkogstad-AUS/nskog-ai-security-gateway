# AI Security Gateway

An AI security gate that watches every tool request made by agents, validates the arguments before execution, enforces configurable policy (local or OPA), records every phase in an append-only event log, exports those events to systems like Splunk, and feeds a console/dashboard so you can trace a correlation, review approvals, and understand which rule fired and why. The UI surfaces KPIs, connector inventory, event trends, and a queue of denied calls plus pending approvals, making the guardrail transparent instead of a black box.

## Repo layout
```
apps/
  gateway/        Fastify v4 API – POST /v1/intercept + approvals/events routes
  console/        Next.js App Router admin UI (queue + timelines + traces)

packages/
  shared/         Types, enums, JSON schemas shared across the stack
  validation/     Ajv 2020-12 instance + per-tool `tool_args` schemas
  eventlog/       Postgres client + append-only `events` table + migrations
  connectors/     ToolRegistry + Mock + ServiceNow connector + schema registry
  policy/         PolicyEngine interface + local stub + fully working OPA client
  exporters/      Event exporter framework + Splunk HEC implementation
```

## Prerequisites

| Tool | Minimum |
|------|---------|
| Node.js | 20 |
| pnpm | 9 (`npm i -g pnpm`) |
| Docker | Recent release (used for Postgres via docker compose) |

## Getting started

```bash
# 1. Install deps for every workspace
pnpm install

# 2. Bring up Postgres
docker compose up -d

# 3. Copy sample env files
cp apps/gateway/.env.example       apps/gateway/.env
cp packages/eventlog/.env.example  packages/eventlog/.env

# 4. Build all packages (required before the first dev run)
pnpm build

# 5. Start watch/dev mode
pnpm dev
```

- Gateway: http://localhost:3001
- Console: http://localhost:3000
- Postgres: localhost:5432 (`gateway:gateway_dev`, db `ai_gateway`)

> Note: `pnpm dev` relies on compiled `dist/` outputs from the packages, so build first.

## Quick commands

```bash
# Run automated tests
pnpm test

# Start Postgres only
pnpm db:up

# Stop the local Docker services
pnpm db:down

# Start the gateway only for manual API testing
pnpm manual

# Start gateway + console for manual testing
pnpm manual:all

# Start just one app if Postgres/build are already handled
pnpm dev:gateway
pnpm dev:console
```

## Core user flows

### POST /v1/intercept

Intercept tool calls, validate args, evaluate policy, emit timeline events, optionally request approvals, and return structured decisions.

```json
{
  "agent_id": "agent-001",
  "tool_name": "web_search",
  "tool_args": { "query": "AI security" }
}
```

- Validation errors return `400` with details.
- Policy denies return `403` with `reason_codes` and timeline events.
- `approval_required` decisions return `202` plus `approval.id`; approve/deny happens via the approvals API.

### Approval APIs

- `POST /v1/approvals` – create a review request from an intercept or manual invocation.
- `GET /v1/approvals?status=pending` – pull pending approval queue.
- `POST /v1/approvals/{id}/approve` or `/deny` – transition the approval, emit `ApprovalApproved`/`ApprovalDenied` and `ToolExecuted` when approved.

### Events + timelines

- `GET /v1/queue` – read-only view of denied tool calls + pending approvals.
- `GET /v1/events?limit=...` – recent events, optional `correlation_id`/`event_type` filters.
- `GET /v1/events/stream` – Server-Sent Events (SSE) stream of new events (for live console refresh).
- `GET /v1/events/{correlation_id}/timeline` – entire chronological chain for a correlation.
- `GET /v1/events/{correlation_id}/policy-trace` – latest policy decision, engine, input hash, and trace details.

## Tooling overview

- **Interception layer** in `apps/gateway` validates the inbound intent, assigns a risk tier from the connector registry, and writes every phase of the intercept loop (`ToolCallProposed`, `PolicyEvaluated`, `ToolCallBlocked`, approval events) to Postgres via `apps/gateway/src/services/event-pipeline.ts`.
- **Connectors** (see `packages/connectors`) declare the tool name, JSON schema, and risk tier. You already have `MockConnector` (`web_search`) and `ServiceNowConnector` (`sn_create_incident`) with scoped credentials. Register new connectors in `apps/gateway/src/index.ts`.
- **Policy engines** live in `packages/policy`: `LocalPolicyEngine` (always allows but flags admin-risk tools for approval), `OPAPolicyEngine` (calls OPA REST API, maps `allow`/`deny`/`redact`, records traces and reason codes). The gateway selects the engine via `POLICY_BACKEND` and logs `policy_input_hash` + trace for auditing.
- **Approvals** are modeled as immutable events. Creating/transitioning approvals happens through `apps/gateway/src/routes/approvals.ts`, but every change writes to the event log so the console and analytics can derive approval queue state.
- **Exporters**: `packages/exporters` hosts an exporter dispatcher; Splunk HEC exporter sends each event with retries, idempotency key (`correlation_id:event_id`), and optional index/source/sourcetype/host metadata configured in `.env`.
- **Console**: 
  - `/` dashboard calls `GET /v1/overview` to power KPI cards, connector table, hourly histogram, and event-type list.
  - `/events` uses `/v1/queue`, `/timeline`, and `/policy-trace` to show denied calls, approvals, timelines, and policy trace JSON.
  - `/events` also subscribes to `/v1/events/stream` to auto-refresh when approvals/denies happen (set `NEXT_PUBLIC_GATEWAY_URL` if the gateway isn't on `http://localhost:3001`).

## Console snapshot (/events)

Minimal but useful operations console:

1. Correlation timeline viewer (enter a `correlation_id` to see ordered events).
2. Incident/approval queue table showing denied calls + pending approvals.
3. Policy trace panel that surfaces engine, input hash, and trace/decision JSON.

## Architecture highlights

- **Connectors & risk tiers**: Each connector (e.g., `web_search`, `sn_create_incident`) declares a risk tier and JSON schema. ServiceNow connector runs with scoped creds via env config.
- **Policy backends**: Default `LocalPolicyEngine` stub plus optional `OPAPolicyEngine` (`POLICY_BACKEND=opa`). Each evaluation emits `policy_input_hash`, `policy_engine`, and optional `policy_trace` for logging.
- **Approvals**: Approval state is derived from append-only events (`ApprovalRequested`, `ApprovalApproved`, `ApprovalDenied`, `ToolExecuted`). The console and APIs read the timeline view.
- **Event export pipeline**: Events are written to Postgres then dispatched to exporters. Splunk HEC exporter sends single-event payloads with retry/jitter and idempotency key `correlation_id:event_id`.

## Environment variables (`apps/gateway/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP port for gateway |
| `DATABASE_URL` | — | Postgres connection string |
| `LOG_LEVEL` | `info` | Fastify log level |
| `POLICY_BACKEND` | `local` | `local` or `opa` |
| `OPA_BASE_URL` | `http://localhost:8181` | Required when backend=opa |
| `OPA_POLICY_PATH` | `gateway/policy` | OPA data path at `/v1/data/...` |
| `OPA_TIMEOUT_MS` | `5000` | Timeout for OPA REST call |
| `SERVICENOW_ENABLED` | `false` | Register ServiceNow connector |
| `SERVICENOW_AUTH_MODE` | `basic` | Or `oauth_client_credentials` |
| `SERVICENOW_USERNAME`/`PASSWORD` | — | Required for basic auth |
| `SERVICENOW_CLIENT_ID`/`SECRET` | — | Required for OAuth flow |
| `SPLUNK_HEC_ENABLED` | `false` | Enable Splunk HEC exporter |
| `SPLUNK_HEC_URL` | `https://splunk.example.com:8088/services/collector/event` | HEC endpoint |
| `SPLUNK_HEC_TOKEN` | — | HEC ingestion token |
| `SPLUNK_HEC_INDEX` | — | Optional Splunk index |
| `SPLUNK_HEC_SOURCE` | `ai-security-gateway` | Optional source override |
| `SPLUNK_HEC_SOURCETYPE` | `agent_security_event` | Optional sourcetype override |
| `SPLUNK_HEC_HOST` | — | Optional host metadata |
| `SPLUNK_HEC_MAX_RETRIES` | `3` | Retry attempts |
| `SPLUNK_HEC_RETRY_BASE_DELAY_MS` | `300` | Backoff base (ms) |
| `SPLUNK_HEC_TIMEOUT_MS` | `5000` | HTTP request timeout |

## Development commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start gateway + console + packages in watch mode |
| `pnpm dev:gateway` | Start only the gateway app |
| `pnpm dev:console` | Start only the console app |
| `pnpm db:up` | Start local Postgres with Docker |
| `pnpm db:down` | Stop local Docker services |
| `pnpm manual` | Start Postgres, build, then run the gateway for manual API testing |
| `pnpm manual:all` | Start Postgres, build, then run gateway + console |
| `pnpm build` | Build all packages + apps |
| `pnpm lint` | Run ESLint across the repo |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm test` | Build packages/apps and run automated tests |
| `pnpm format` | Format `.ts/.tsx/.json/.md` files |

## Automated tests

The repo now includes automated tests for core validation and gateway intercept flows.

```bash
pnpm test
```

Current test coverage is dependency-free and does not require Postgres or Docker. It exercises:

- schema validation for tool arguments
- gateway intercept allow/deny/approval/auth branches using Fastify injection

### Manual migrations

```bash
DATABASE_URL=postgres://gateway:gateway_dev@localhost:5432/ai_gateway \
  pnpm --filter @ai-security-gateway/eventlog migrate
```

### Filtering workspaces

```bash
pnpm --filter gateway dev        # gateway only
pnpm --filter @ai-security-gateway/shared build
```

## Testing & CI

- CI workflow `.github/workflows/ci.yml` boots Postgres, runs `pnpm install --frozen-lockfile`, then `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.
