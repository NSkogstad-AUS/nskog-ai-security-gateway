# AI Security Gateway

A monorepo scaffold for an AI agent security gateway — intercepts tool calls made by AI agents, validates arguments, evaluates policy, and writes an immutable audit log.

## Repo Structure

```
apps/
  gateway/        Fastify API  – POST /v1/intercept
  console/        Next.js admin UI (App Router)

packages/
  shared/         TypeScript types, JSON schemas, enums
  validation/     Ajv 2020-12 instance + tool-arg validation helpers
  eventlog/       Postgres client + append-only events table + migrations
  policy/         PolicyEngine interface + LocalPolicyEngine + OPA client
  connectors/     ToolRegistry + MockConnector + ServiceNow connector
  exporters/      Event exporters (Splunk HEC)
```

## Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | ≥ 20 |
| [pnpm](https://pnpm.io/) | ≥ 9 (`npm i -g pnpm`) |
| [Docker](https://www.docker.com/) | any recent version |

## Quick Start

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start Postgres
docker compose up -d

# 3. Copy environment files
cp apps/gateway/.env.example       apps/gateway/.env
cp packages/eventlog/.env.example  packages/eventlog/.env

# 4. Build all packages (required before first dev run)
pnpm build

# 5. Start all services in watch mode
pnpm dev
```

- Gateway: http://localhost:3001
- Console:  http://localhost:3000
- Postgres: localhost:5432 (user `gateway`, password `gateway_dev`, db `ai_gateway`)

> **Note:** Run `pnpm build` at least once before `pnpm dev`. The gateway is started
> with `tsx watch` (which transpiles TypeScript on the fly), but it imports compiled
> `dist/` outputs from the other packages. Turbo's `dev` task depends on `^build`
> so dependencies are compiled before the servers start on the first run.

## Example: POST /v1/intercept

```bash
curl -X POST http://localhost:3001/v1/intercept \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-001",
    "tool_name": "web_search",
    "tool_args": {
      "query": "latest AI security vulnerabilities",
      "max_results": 5
    }
  }'
```

Expected response (`200 OK`):

```json
{
  "correlation_id": "3f7b1c4e-...",
  "result": "allow",
  "reason": "LocalPolicyEngine stub – all requests allowed",
  "evaluated_at": "2025-01-01T00:00:00.000Z"
}
```

Supply your own `correlation_id` to correlate multiple events:

```bash
curl -X POST http://localhost:3001/v1/intercept \
  -H "Content-Type: application/json" \
  -d '{
    "correlation_id": "session-abc-123",
    "agent_id": "agent-001",
    "tool_name": "web_search",
    "tool_args": { "query": "test query" }
  }'
```

Invalid `tool_args` return `400`:

```bash
curl -X POST http://localhost:3001/v1/intercept \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-001",
    "tool_name": "web_search",
    "tool_args": {}
  }'
# → 400 { "error": "tool_args validation failed", "details": ["/ must have required property 'query'"] }
```

## Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps + packages in watch mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all workspaces |
| `pnpm typecheck` | TypeScript type-check all workspaces |
| `pnpm test` | Run test suites (placeholder — returns 0) |
| `pnpm format` | Prettier-format all `.ts`, `.tsx`, `.json`, `.md` |

### Run migrations manually

```bash
DATABASE_URL=postgres://gateway:gateway_dev@localhost:5432/ai_gateway \
  pnpm --filter @ai-security-gateway/eventlog migrate
```

### Filter to a single workspace

```bash
pnpm --filter gateway dev          # gateway only
pnpm --filter @ai-security-gateway/shared build
```

## Architecture Notes

### Append-only event log
The `events` Postgres table is intentionally INSERT-only. The only write path is
`appendEvent()` in `packages/eventlog`. No update or delete operations are provided.

### Ajv draft 2020-12
`packages/validation` exports a single `Ajv2020` instance. Do **not** mix it with a
draft-07 `Ajv` instance — they validate different keywords and can silently disagree.
Add new tool schemas to `toolArgSchemas` in `packages/validation/src/validate.ts`.

### Policy engine
The gateway supports both local and OPA policy backends. Set:

- `POLICY_BACKEND=local` (default), or
- `POLICY_BACKEND=opa` with `OPA_BASE_URL` (and optional `OPA_POLICY_PATH`, `OPA_TIMEOUT_MS`).

When OPA is enabled, the gateway sends `{"input": <ToolCallIntent>}` to
`POST /v1/data/{OPA_POLICY_PATH}` and logs `policy_input_hash` plus the decision output.

### Adding a real connector
1. Implement `ToolConnector` in `packages/connectors/src/`.
2. Add the connector's `argsSchema` to `toolArgSchemas` in `packages/validation`.
3. Register the connector in `apps/gateway/src/index.ts` via `globalRegistry.register()`.

## Environment Variables

### `apps/gateway/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `DATABASE_URL` | — | Postgres connection string |
| `LOG_LEVEL` | `info` | Fastify log level |
| `POLICY_BACKEND` | `local` | Policy backend (`local` or `opa`) |
| `OPA_BASE_URL` | `http://localhost:8181` | OPA base URL (required when backend is `opa`) |
| `OPA_POLICY_PATH` | `gateway/policy` | OPA data path under `/v1/data` |
| `OPA_TIMEOUT_MS` | `5000` | OPA request timeout in milliseconds |
| `SERVICENOW_ENABLED` | `false` | Enable ServiceNow connector |
| `SPLUNK_HEC_ENABLED` | `false` | Enable Splunk HEC exporter |

## CI

GitHub Actions workflow at `.github/workflows/ci.yml`:
- Spins up a Postgres service container
- Runs `pnpm install --frozen-lockfile`
- Runs `pnpm build` → `pnpm typecheck` → `pnpm lint` → `pnpm test`
