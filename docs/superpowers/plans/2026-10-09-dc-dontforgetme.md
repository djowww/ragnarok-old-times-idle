# DC_DONTFORGETME (Slow Grace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement source-backed Slow Grace for solo hunting, with area pulses and actual monster movement/ASPD penalties.

**Architecture:** Keep source formulas and square-area construction in pure helpers. Extend the encounter timeline's existing `skillUnits` path for field placement, 3-second pulses, expiry, and out-of-area grace; feed active status values into the existing monster-status calculations.

**Tech Stack:** TypeScript, Vitest, Hercules pre-renewal database/source at pinned commit `410b9738c049ab1825d67b36b072d837c1d0b33a`.

**Spec:** `docs/superpowers/specs/2026-10-09-dc-dontforgetme-design.md`

## Global Constraints
- Preserve all existing characters, inventory, and progress; no wipe, grants, or profile edits.
- Change only the worktree; do not publish this individual packet to the VPS.
- Match the Hercules skill/status rules recorded in the spec; do not alter common attack, reward, drop, or map-population formulas.

## Review Focus
- Wrong or missing weapon must prevent cast without charging SP.
- Field affects every enemy cell covered by the 7x7 layout and no enemy outside it.
- Repeated pulses refresh values without duplicate log spam or duplicate fields.
- Field expiry stops pulses; an applied status remains effective through its own 20-second timer, then is ignored at `expiresAt` (expired records may remain lazily stored).
- Empty SP ends the field at the due 10-second drain, not before or after.
- Status changes apply to later movement/attack deadlines and do not rewrite an already committed action.

---

### Task 1: Pure Slow Grace rules

**Files:**
- Create: `idle/engine/slowGraceRules.ts`
- Create: `idle/tests/slowGraceRules.test.ts`

**Interfaces:** `slowGraceValues(level, dex, agi, dancingLesson)`, `slowGraceCells(center)`, `slowGraceCovers(cells, point)`, and a pure source-cost/drain helper.

- [x] Write tests for source-derived formulas, level/stat/lesson boundaries, centered 7x7 layout, cell-edge inclusion, 20-second grace, and 10-second 1-SP drain.
- [x] Run the focused tests and confirm expected RED failures.
- [x] Implement the minimal pure rules.
- [x] Re-run focused tests to GREEN.

### Task 2: Encounter field and monster effects

**Files:**
- Modify: `idle/shared/types.ts` (persisted per-unit SP drain clock and source ownership)
- Modify: `idle/engine/encounters.ts` (eligibility, field placement, pulse, expiry, drain, status timeout, movement and ASPD use)
- Modify: `idle/engine/classicStatuses.ts` (derive active Slow Grace modifiers)
- Create: `idle/tests/slowGraceCombatFlow.test.ts`

**Interfaces:** Reuse the persisted `Battle.skillUnits` timeline; identify this unit by `DC_DONTFORGETME`; each enemy status records `skillId`, `sourceActorId`, and `groundId` so expiry and refresh cannot remove unrelated effects.

- [x] Write RED combat-flow cases for weapon validation/resource safety, auto rotation, multi-enemy 7x7 pulses, scaled penalties, grace/field expiry, SP drain termination, and action clocks.
- [x] Run the focused suite and inspect each failure for the intended missing behavior.
- [x] Implement field lifecycle and status integration in small RED/GREEN steps.
- [x] Run the focused suite and related status/field population regressions.

### Task 3: Catalog and release gates

**Files:**
- Modify: `idle/tools/export-content.mjs`
- Modify: `idle/content/catalog.json`
- Modify: `idle/content/source-manifest.json`
- Modify: `idle/tests/content.test.ts` and source coverage assertions.

- [x] Add exact source-derived catalog support metadata and coverage expectations.
- [x] Run affected content/combat tests, typecheck, and build.
- [x] Record files, source lines, results, catalog totals, warnings, and no-publication boundary in the meta progress ledger.

Execution note (2026-10-09): final full suite 1,439 passed / 8 skipped, typecheck and build passed. A final expiry-boundary regression was aligned to the engine's lazy status storage: `SC_DONTFORGETME` remains mechanically effective until 198000 and is ignored at that exact timestamp. Build warnings are runtime-resolved client assets and the >500 kB UI chunk. Full content export could not finish because the local item-resource table provider was unavailable; committed catalog/manifest metadata and hashes are checked by `content.test.ts`. Local worktree only; no VPS publication, profile writes, grants, or wipe.
