# Ragnarok Old Times Idle Review Remediation Plan

> **Execution:** Implement inline in the already-authorized isolated worktree. Preserve all pre-existing user changes.

**Goal:** Address the confirmed local startup, persistence, offline catch-up, and asset-cache findings from the code review.

**Architecture:** Allow Hercules to initialize beside the idle tables in the shared local database. Keep the browser's fast snapshot polling read-only, persist contact every 10 seconds (below the existing 30-second offline-summary threshold), and avoid writing unchanged paused state. Make long server-side simulation cooperative without changing tick order, and evict only failed actor loads so recovered assets can be retried.

**Tech Stack:** TypeScript, Fastify, MariaDB, Docker Compose, React.

**Spec:** Findings in the immediately preceding code review. The current worktree already contains the MVP/mini-boss catalog expansion; preserve it and do not duplicate that work.

## Global Constraints

- Keep the 12-hour offline simulation cap and existing deterministic tick semantics.
- Preserve request receipt/idempotency behavior and current single-profile local setup.
- Do not modify VPS or public deployment configuration.
- Preserve all pre-existing uncommitted changes in this worktree.
- Do not add or run tests in this task; run the non-test production build for verification.

## Review Focus

- A clean shared database must initialize Hercules even if idle tables were created first.
- Session polling must not take a write lock on every 850 ms refresh.
- A paused game must not produce a MariaDB update every five seconds.
- Twelve hours of catch-up must preserve simulation results while yielding to the Node event loop.
- A failed sprite request must be retriable after the asset service recovers.

---

### Task 1: Shared-database Hercules bootstrap

**Files:**
- Modify: `docker/hercules/entrypoint.sh`
- Modify: `compose.yaml` only if the entrypoint alone cannot safely resolve the initialization order.

- [x] Permit the exact idle-only table set (`idle_profiles`, `idle_commands`) to coexist with a not-yet-initialized Hercules schema.
- [x] Continue failing safely when other unexpected or partial Hercules tables exist.

### Task 2: Read-only session polling and paused no-op transactions

**Files:**
- Modify: `idle/server/app.ts`
- Modify: `idle/server/index.ts`
- Modify: `idle/server/repository.ts` only for narrowly defined no-op handling if required.

- [ ] Serve ordinary `/api/session` refreshes from a read plus an ephemeral current snapshot.
- [x] Persist contact on a 10-second heartbeat so active sessions stay below the offline-summary threshold.
- [x] Skip the background timer's state update when the persisted state is paused.
- [x] Keep command transactions and receipts unchanged.

### Task 3: Cooperative server catch-up

**Files:**
- Modify: `idle/engine/index.ts`
- Modify: `idle/server/app.ts`
- Modify: `idle/server/index.ts`
- Modify: `idle/server/repository.ts`

- [x] Share one ordered simulation implementation between synchronous engine callers and yielding server callers.
- [x] Let repository transactions await the server simulation callback while holding the row lock.
- [x] Yield periodically during long gaps without changing the 12-hour cap or tick order.

### Task 4: Recoverable sprite-load failures

**Files:**
- Modify: `idle/web/assets/renderer.ts`
- Modify: `idle/web/components/Scene.tsx`

- [x] Keep successful actor assets cached.
- [x] Remove failed/fallback actor loads from the cache, guarded so an older failed request cannot erase a newer cache entry.
- [x] Retry failed actor loads with capped exponential delay and cancel the retry when the actor inputs change or the scene unmounts.

### Task 5: Preserve already-added boss coverage

**Files:** no edits expected.

- [x] Confirm the current worktree's expanded roster remains intact; report it as already addressed.

### Verification

- [x] Inspect the final diff and preserve pre-existing changes.
- [x] Run `pnpm build`, `pnpm typecheck`, `docker compose config --quiet`, and Bash syntax validation; do not run test commands.
