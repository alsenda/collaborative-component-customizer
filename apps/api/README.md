# apps/api

Fastify API service with a minimal `/health` endpoint for smoke checks.

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
