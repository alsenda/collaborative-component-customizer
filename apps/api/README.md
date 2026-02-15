# apps/api

Fastify API service with a minimal `/health` endpoint for smoke checks.

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
