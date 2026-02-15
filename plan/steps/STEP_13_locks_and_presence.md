# STEP_13: Locks + presence

Status: done

## Goal
Add server-enforced soft lock and presence semantics to realtime flows in `apps/api`, using existing shared protocol messages, and provide a minimal `apps/web` debug proof that lock/presence state is consumable by the frontend.

## Acceptance criteria
- [x] `apps/api` enforces single-holder soft locks per `lockTarget` within a room: first valid `lockAcquire` grants, competing acquire for same target returns typed `lockDenied` with reason `alreadyLocked`.
- [x] `apps/api` validates lock targets using shared runtime validation and returns typed `lockDenied` with reason `invalidTarget` when lock acquisition is rejected for an invalid target at dispatcher boundaries.
- [x] Lock ownership is scoped by room and target; lock events do not leak across rooms.
- [x] `lockReleased` from the lock holder releases the target and is broadcast as typed `lockReleased` to room subscribers; non-holder release attempts do not release the lock.
- [x] On disconnect, any locks held by that connection/client are deterministically released and corresponding typed `lockReleased` messages are emitted to affected room subscribers.
- [x] Presence updates are emitted as typed `presence` messages for room membership changes (`join`/disconnect) with deterministic `clientIds` ordering.
- [x] Realtime logs include only minimal non-sensitive metadata for lock/presence events (event type, roomId, clientId/connectionId, lock target key) and never include doc payload bodies.
- [x] `apps/api` tests deterministically cover lock grant/deny, release permissions, disconnect cleanup, room isolation, and presence emission.
- [x] `apps/web` renders a visible `STEP_13` debug section showing lock action result state and latest parsed `presence`/lock server payload JSON for a deterministic demo flow.
- [x] `npm run typecheck --workspace @collaborative-component-customizer/api` passes.
- [x] `npm run test --workspace @collaborative-component-customizer/api` passes.
- [x] `npm run lint --workspace @collaborative-component-customizer/api` passes.
- [x] `npm run typecheck --workspace @collaborative-component-customizer/web` passes.

## Technical analysis
- Build on STEP_12 dispatcher/connection registry; keep protocol handling centralized in dispatcher (no lock logic inside transport adapter beyond lifecycle forwarding).
- Use shared protocol contracts from `packages/shared` only (`lockAcquire`, `lockGranted`, `lockDenied`, `lockReleased`, `presence`) to avoid message-shape drift.
- Represent held locks with an explicit room-scoped in-memory map keyed by canonicalized `lockTarget` identity, storing owner `clientId` and `connectionId` for deterministic permission checks and disconnect cleanup.
- Emit presence snapshots from the same room membership registry used by realtime subscriptions, with stable sorting to keep tests deterministic.
- Keep STEP_13 scope limited to ephemeral lock/presence behavior:
  - no persistence of locks/presence in SQLite
  - no save/reapply/version pointer changes (STEP_14)
  - no full editor lock UX (STEP_25)
- Preserve WebTransport-only transport policy for this project phase; no fallback transport implementation in this step.

## Subtasks
1. Add lock state primitives in realtime dispatcher
   - Introduce room + target keyed lock registry and target key canonicalization utility.
   - Track owner client/connection metadata needed for release and disconnect cleanup.

2. Implement lock message handling
   - Handle `lockAcquire` and `lockReleased` in dispatcher using shared typed messages.
   - Emit `lockGranted`, `lockDenied`, and `lockReleased` with stable, typed payloads.
   - Enforce holder-only release behavior.

3. Implement presence emission behavior
   - Emit `presence` message on room join/subscribe membership changes and disconnect cleanup.
   - Ensure deterministic `clientIds` ordering.

4. Wire disconnect cleanup
   - On connection close, release all locks owned by that connection/client.
   - Broadcast resulting `lockReleased` and updated `presence` messages to affected room subscribers.

5. Add deterministic API realtime tests
   - Add/extend dispatcher and adapter-contract tests for lock acquire/deny, non-holder release, holder release, disconnect cleanup, and cross-room isolation.
   - Assert presence payload shape and deterministic ordering.

6. Add minimal web debug proof for STEP_13
   - Extend existing debug/demo UI with a `STEP_13` section.
   - Execute deterministic lock actions (acquire/release) against the realtime endpoint and render status plus latest received lock/presence payload JSON.
   - Preserve minimal proof-only UX (no editor/lock controls beyond debug triggers).

7. Documentation and quality gates
   - Update `apps/api/README.md` with STEP_13 lock/presence message behavior and status outcomes.
   - Run API lint/test/typecheck and web typecheck.

## Risks and mitigations
- Risk: Lock identity mismatch across atomic/page targets can cause false conflicts or leaks.
  - Mitigation: Use one canonical target-key builder with deterministic serialization and dedicated tests.
- Risk: Presence churn could become noisy with duplicate subscriptions.
  - Mitigation: Normalize room membership by connection/client and emit stable snapshots only from authoritative registry changes.
- Risk: Scope creep into full lock UX or persistence.
  - Mitigation: Keep implementation ephemeral and proof-oriented; defer persistence/editor UX to planned later steps.
- Risk: Inconsistent disconnect handling can leave stale locks.
  - Mitigation: Centralize cleanup in connection teardown path and cover with deterministic tests.

## Test plan
- API deterministic tests in `apps/api/test`:
  - first `lockAcquire` receives `lockGranted`
  - second client acquiring same target receives `lockDenied` (`alreadyLocked`)
  - invalid lock target path receives `lockDenied` (`invalidTarget`) at dispatcher boundary handling
  - non-holder `lockReleased` does not release lock; holder release does
  - disconnect of holder emits `lockReleased` and frees target for next acquire
  - room isolation for both lock and presence messages
  - presence payload emits deterministic sorted `clientIds`
- Web verification:
  - run API + web and confirm visible `STEP_13` section updates for acquire/release actions
  - confirm latest serialized inbound payload shows lock/presence message types and expected fields
- Run:
  - `npm run typecheck --workspace @collaborative-component-customizer/api`
  - `npm run test --workspace @collaborative-component-customizer/api`
  - `npm run lint --workspace @collaborative-component-customizer/api`
  - `npm run typecheck --workspace @collaborative-component-customizer/web`
