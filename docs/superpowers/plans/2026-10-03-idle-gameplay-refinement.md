# Idle gameplay refinement implementation plan

> **For agentic workers:** Use the approved scope in the linked design. Work in the existing managed worktree. Follow the session instruction not to add or run tests; use typecheck, build, review and browser inspection for verification.

**Goal:** Correct combat/economy defects and make area choice, skill rotation and quest readiness useful in the idle loop.

**Architecture:** Preserve the existing 1-second deterministic server simulation and profile JSON. Add optional state for pending area, focus and bounded hunt activity; all commands remain validated and server authoritative. The browser reads these fields and shows estimated rates from the last 15 minutes.

**Tech Stack:** TypeScript, React, Node, MariaDB, Docker Compose, generated Hercules catalog.

**Spec:** `docs/superpowers/specs/2026-10-03-idle-gameplay-refinement-design.md`

## Global constraints

- Keep existing `djow` save, schema version 1, local GRFs and Docker services intact.
- Do not add dependencies or run/add tests; use typecheck/build/static review/browser inspection.
- Do not turn focused hunts into guaranteed spawns or alter original monster drop chances.

## Tasks

### 1. Combat integrity and activity model

**Files:** `idle/shared/types.ts`, `idle/server/validation.ts`, `idle/engine/commands.ts`, `idle/engine/combat.ts`, `idle/engine/index.ts`, new `idle/shared/hunt.ts` if useful.

- [x] Define optional `pendingAreaId`, `huntFocus`, `areaActivity` and `setHuntFocus` command contracts. Use focus strings `any`, `monster:<id>`, or `element:<name>`; validate membership in the chosen area.
- [x] Enforce recovery/challenge rules and queue area changes during an ordinary battle. Apply the queued destination after victory, clear it on defeat/retreat. Retreat through `stop` costs 10 seconds; manual `rest` costs 30 seconds and preserves the auto-resume choice.
- [x] Preserve the scheduled enemy deadline remainder and choose HP/SP potions by missing resource and healing strength.
- [x] Select focused monsters with 3:1 weighting and add a 1000 ms focused-hunt encounter delay. Record and prune one-minute activity buckets for the previous 15 minutes.
- [x] Verify no type errors in the changed engine files by `pnpm typecheck` from `idle/`; inspect the diff and paths for old-profile compatibility.

### 2. Shop stock

**Files:** `idle/content/rules.json`, `idle/tools/export-content.mjs`, generated `idle/content/catalog.json`, `idle/content/source-manifest.json`.

- [x] Remove items 2302 and 2320 from `rules.shop`, and keep both item definitions in the generated catalog through an explicit non-shop source; leave prices, ownership and drops unchanged.
- [x] Run `pnpm export-content` from `idle/`; inspect the generated diff to confirm both items now have `shop:false`.

### 3. Skill, quest, area and challenge UI

**Files:** `idle/web/App.tsx`, `idle/web/panels/World.tsx`, `idle/web/hud.css`, `idle/web/styles.css`.

- [x] Build F1-F3 from the rotation, show readiness reasons, and leave F4-F7 empty.
- [x] Show pending area/retreat, disable rest in challenge, and show the current hunt focus.
- [x] Prioritize ready quest rewards in the journey card and show progress for incomplete objectives.
- [x] Add map-panel focus selectors and 15-minute rate/risk estimates with collecting states.
- [x] Verify responsive presentation and icon loading by read-only browser inspection.

### 4. Integrate and deliver

- [x] Run `pnpm typecheck`, `pnpm build`, and `git diff --check`; do not run tests.
- [x] Obtain independent read-only code review, resolve high-impact findings, rebuild `idle-game` in Docker and confirm health.
- [x] Inspect the local game in the browser without issuing gameplay commands on `djow`.
- [x] Commit in the worktree and fast-forward the clean main checkout; report the commit and any unverified behavior.
