# apps/api

Fastify API service with a minimal `/health` endpoint for smoke checks.

## Realtime endpoints

- `GET /realtime/webtransport`
	- reserved endpoint for WebTransport (HTTP/3) sessions
	- returns `426` when reached over regular HTTP to make no-fallback policy explicit
- `POST /realtime/webtransport/demo-flow`
	- deterministic adapter-contract demo route
	- returns latest typed realtime payload from backend dispatcher flow
- `POST /realtime/webtransport/lock-presence-demo`
	- deterministic lock/presence demo route
	- runs `join`, `lockAcquire`, competing `lockAcquire`, invalid target acquire, and holder release
	- returns latest typed lock/presence payload and recent lock/presence event list

### Lock + presence behavior

- Soft locks are room-scoped and target-scoped (`atomic` or `page` target key).
- First valid `lockAcquire` receives `lockGranted`.
- Competing acquire for the same room+target receives `lockDenied` with `reason: "alreadyLocked"`.
- Invalid room target for lock acquisition receives `lockDenied` with `reason: "invalidTarget"`.
- `lockReleased` is holder-only; non-holder release attempts do not release locks.
- On disconnect, all locks owned by the disconnected connection are released and typed `lockReleased` messages are emitted to the room.
- Presence is emitted as typed `presence` snapshots on join/subscribe and disconnect with deterministic sorted `clientIds`.

Fallback transports are intentionally unavailable:

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
- `POST /rooms/:roomId/save`
	- `200`: creates a new immutable version from current room doc and updates current pointer
	- `404`: room/current snapshot not found
	- `400`: invalid `roomId` or request body
- `POST /rooms/:roomId/reapply`
	- `200`: creates a new immutable latest version from requested historical version and updates current pointer
	- `404`: source version not found for room
	- `400`: invalid `roomId` or invalid `versionId` in request body

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
