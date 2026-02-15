# apps/api

Fastify API service with a minimal `/health` endpoint for smoke checks.

## Realtime endpoint (STEP_12)

- `GET /realtime/webtransport`
	- reserved endpoint for WebTransport (HTTP/3) sessions
	- returns `426` when reached over regular HTTP to make no-fallback policy explicit
- `POST /realtime/webtransport/demo-flow`
	- deterministic adapter-contract demo route for STEP_12 proof
	- returns latest typed realtime payload from backend dispatcher flow

Fallback transports are intentionally unavailable in STEP_12:

- no WebSocket fallback
- no SSE fallback
- no polling fallback

## Room document and version endpoints

- `GET /rooms/:roomId/current`
	- `200`: returns current room snapshot and current version pointer
	- `404`: room/current snapshot not found
- `GET /rooms/:roomId/versions`
	- `200`: returns room version summaries in deterministic order (`created_at_iso DESC`, then `version_id DESC`)
	- `404`: room not found
- `GET /rooms/:roomId/versions/:versionId`
	- `200`: returns specific room version document
	- `404`: version not found for room

## Database migrations

- Run migrations: `npm run migrate --workspace @collaborative-component-customizer/api`
- Default database path: `apps/api/data/api.sqlite`
- Override database path: set `API_DB_PATH=/absolute/path/to/file.sqlite`

### Migration conventions

- Migration files live in `src/db/migrations` and use ordered IDs (for example `0001_initial_schema.ts`).
- Applied migration versions are tracked in `schema_migrations`.

### Rollback strategy

- `0001_initial_schema`: irreversible in-place migration.
- Rollback method: restore a database backup created before running migrations.
