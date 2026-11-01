# Sentido Sobrenatural (Sense) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement WZ_ESTIMATION as a manual solo skill that captures and presents one source-faithful inspection result for the selected live monster instance.

**Architecture:** A focused engine helper reads effective instance status and the pinned elemental table to form the exact source packet values. The normal `useSkill` command validates a caller-supplied live actor ID, pays once through the existing receipt transaction, and stores one immutable result associated with that actor. A dedicated inspection view presents this snapshot separately from the static species entry in the Bestiary; the skill remains outside AFK rotation.

**Tech Stack:** TypeScript, existing GameState JSON persistence, Vitest, React UI, pinned Hercules pre-renewal source.

**Spec:** `.superpowers/sdd/ragidle-admin-world-completion/sense-contract-luna/contract.md`, grounded in `docs/superpowers/plans/2026-10-07-ragidle-admin-world-completion.md` and its WZ_ESTIMATION section in `.superpowers/sdd/ragidle-admin-world-completion/next-solo-after-guardian.md`.

## Global Constraints

- Use Hercules commit `410b9738c049ab1825d67b36b072d837c1d0b33a` and its cached source as the authority.
- Sense is `WZ_ESTIMATION` ID 93, Lv1, target MOB, range 9, 10 SP, no damage, no cooldown/aftercast declared.
- Keep each result tied to `expectedEnemyId`; species ID alone never identifies a live target.
- Capture a one-time snapshot; never overwrite or refresh the static Bestiary species data.
- Sense is a manual action outside every AFK/automatic skill rotation; it changes no enemy HP/status, RNG, rewards, or loot.
- Use existing JSON state and command receipt transaction; do not introduce database schema/account changes.
- Keep source `skillId`, source metadata, and all nine elemental matchup values when regenerating catalog/manifest; do not mark supported before engine, command, content, and UI evidence passes.
- No profile wipe, real-profile grants, or public deployment is part of implementation validation.

## Review Focus

- **Stale actor ID or same-species replacement:** command must reject before spending SP and must never transfer an old result to the replacement. Task 2 tests both cases.
- **Exactly-at-range and outside-range targets:** the source playerBattleDistance value 9 succeeds and value 10 fails before resource debit; its geometric boundary is 10.0625 cells. Task 2 tests both boundaries.
- **One-time source snapshot versus changing live data:** HP/property changes after reading must not mutate the captured result; a second deliberate cast captures new values. Task 2 tests the snapshot semantics.
- **Converted property and source rates:** use the active effective instance property for all nine matchups while static Bestiary remains unchanged. Task 1 tests status/property calculation; Task 3 tests both views together.
- **Request retry and target removal:** same receipt costs once; death, despawn, area change, or population replacement closes/removes the result. Tasks 2 and 3 test command and visible lifecycle.

---

### Task 1: Source-faithful Sense result

**Files:**
- Create: `idle/engine/senseInspection.ts`
- Modify: `idle/shared/types.ts`
- Test: `idle/tests/senseInspection.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `BattleEnemy`, `effectiveMonsterStatus(monster, statuses, at)`, and catalog `elementModifiers`.
- Produces: `SenseInspectionResult` in `idle/shared/types.ts`; `makeSenseInspection(catalog: Catalog, enemy: BattleEnemy, at: number, identity: { areaId: string | null; challengeId?: string; fieldGeneration?: number }, senseType = 3): SenseInspectionResult`.
- `SenseInspectionResult` stores `sourceSkill`, `actorId`, `monsterId`, the supplied encounter identity (`areaId`, optional `challengeId`/`fieldGeneration`), `observedAt`, `classId`, `level`, `size`, `currentHp`, source packet totals `def`/`mdef`, `race`, effective `element`/`elementLevel`, and the nine integer `elementRates` in Hercules order. It does not store max HP or hard/soft components as separate displayed fields.

- [x] **Step 1: Write failing source-contract tests**

Create tests asserting `senseType` bit 1 selects hard, bit 2 selects soft, default 3 sums both; hard/soft components derive from effective monster data (`def`, `VIT`, `mdef`, `INT + (VIT >> 1)`); no `defPercent` is applied; current HP is used; and levels/statuses/conversion follow `effectiveMonsterStatus`.

Add an assertion for all nine rates in `Water, Earth, Fire, Wind, Poison, Holy, Shadow, Ghost, Undead` order, including a negative source rate presented as 0. A converted property must change the result rates while the static catalog monster remains unchanged.

- [x] **Step 2: Run the focused test to verify RED**

Run from `idle`: `pnpm test -- tests/senseInspection.test.ts`

Expected: FAIL because the result type/helper does not yet exist.

- [x] **Step 3: Implement `makeSenseInspection`**

In `idle/engine/senseInspection.ts`, use the effective-status helper, source default `senseType = 3` (`battle.c:7872`), source order and negative clamp. Combine hard/soft integer fields only when the corresponding flag is set. Preserve exact values as a one-time result; do not apply combat `defPercent`.

- [x] **Step 4: Run the focused test to verify GREEN**

Run from `idle`: `pnpm test -- tests/senseInspection.test.ts`

Expected: all source-contract assertions pass.

- [x] **Step 5: Preserve the shared working tree**

Do not stage or commit this shared dirty tree: it contains earlier project work outside this packet. The verified release archive is the deployment artifact; preserve all working-tree history in place.

### Task 2: Manual live-target command and result lifecycle

**Files:**
- Modify: `idle/shared/types.ts`
- Modify: `idle/server/validation.ts`
- Modify: `idle/engine/commands.ts`
- Modify: `idle/engine/encounters.ts` only where actor removal/area lifecycle already passes
- Test: `idle/tests/senseCommand.test.ts`

**Interfaces:**
- Consumes: `SenseInspectionResult`, `makeSenseInspection`, existing `GameCommand.useSkill`, `classSkills`, `paySkillResources`, movement/target distance helpers, and normal command receipt transaction.
- Produces: optional `GameState.senseInspection?: SenseInspectionResult`; `GameCommand.useSkill` gains optional `expectedEnemyId?: string`. For `manualUse === "inspect"` and `sourceName === "WZ_ESTIMATION"`, this value is mandatory.

- [x] **Step 1: Write failing command tests**

In `idle/tests/senseCommand.test.ts`, use a real exported catalog and a lawful Wizard fixture with Sense learned at level 1. Assert success on the current selected enemy at range 9, 10 SP debit, one skill event, saved result tied to that exact `enemyId`, no damage/status/loot/XP/RNG change, and no AFK rotation eligibility.

Assert refusal before SP debit for SP 9, unlearned/invalid level, wrong current class, unsupported row, no expected ID, stale or same-species-other-instance ID, dead/missing actor, Emperium, wrong area, and source-reported distance 10 (geometry at or above 10.0625 cells). Assert the target is never silently changed. Reapplying the same command receipt returns the same result and spends once; a distinct deliberate use spends again and replaces the captured snapshot.

Test that later HP/status changes do not update the result, and that actor death, despawn, field generation replacement, challenge end, or area change clears the result.

- [x] **Step 2: Run the focused test to verify RED**

Run from `idle`: `pnpm test -- tests/senseCommand.test.ts`

Expected: FAIL for missing result state, actor-bound command field, validation, and handler.

- [x] **Step 3: Implement the manual command**

Extend HTTP validation for the optional token-shaped `expectedEnemyId`. In the `useSkill` Sense branch, require supported metadata, exact level 1, learned skill and `classSkills(c, s.job)` eligibility, active field/battle, valid live actor and range 9 before calling `paySkillResources`. Charge 10 SP once, call `makeSenseInspection`, attach the result to state, and emit only a non-damaging skill event. Do not add RNG, enemy effects, automatic scheduling, or a new cooldown. Keep the existing transaction/receipt path.

Invalidate only this result when its stored actor no longer exists alive in the same current encounter/population and area. Use the existing actor ID and population generation/encounter identity; never validate by `monsterId` alone.

- [x] **Step 4: Run the focused test to verify GREEN**

Run from `idle`: `pnpm test -- tests/senseCommand.test.ts`

Expected: all cost, eligibility, target, retry, immutability, and lifecycle assertions pass.

- [x] **Step 5: Preserve the shared working tree**

Do not stage or commit this shared dirty tree: it contains earlier project work outside this packet. The verified release archive is the deployment artifact; preserve all working-tree history in place.

### Task 3: Content metadata and inspection UI

**Files:**
- Modify: `idle/tools/export-content.mjs`
- Regenerate: `idle/content/catalog.json`
- Regenerate: `idle/content/source-manifest.json`
- Modify: `idle/web/App.tsx`
- Modify: `idle/web/panels/Build.tsx`
- Modify: `idle/web/panels/World.tsx`
- Create: `idle/web/panels/SenseInspection.tsx` (or the equivalent focused component if an existing panel seam fits)
- Test: `idle/tests/senseContent.test.ts`
- Test: `idle/tests/sensePresentation.test.ts`

**Interfaces:**
- Consumes: supported catalog skill `sense` with `manualUse: "inspect"`, the current live target ID selected by battle/field targeting, `GameCommand.useSkill.expectedEnemyId`, and `GameState.senseInspection`.
- Produces: one visible manual skill action and a live inspection view that is separate from the static species details in Bestiary.

- [x] **Step 1: Write failing source metadata and view tests**

`idle/tests/senseContent.test.ts` asserts generated `sense` keeps `id: sense`, `sourceName/mechanic: WZ_ESTIMATION`, Hercules ID 93, level 1, 10 SP, range 9, target `enemy`, no damage, `manualUse: inspect`, and the existing source identity/requirements metadata. It also asserts Sense is absent from automatic rotation candidates.

`idle/tests/sensePresentation.test.ts` asserts the Build action submits the live `expectedEnemyId`, is disabled for missing/dead/out-of-range targets, and does not add Sense to the AFK rotation. The inspection view displays the captured actor identity, time, current HP and values/rates as captured; it hides on actor removal/area change and remains separate from the static species sheet.

- [x] **Step 2: Run the focused UI/content tests to verify RED**

Run from `idle`: `pnpm test -- tests/senseContent.test.ts tests/sensePresentation.test.ts`

Expected: FAIL because Sense is still marked unsupported and has no manual inspect presentation.

- [x] **Step 3: Integrate exporter and UI**

Add WZ_ESTIMATION to the supported utility mechanism path only after Tasks 1–2 are GREEN; map it to manual use `inspect`; preserve the pinned source fields and write its source lines/config default into the generated manifest. Regenerate only catalog and source manifest using the pinned cache; review the exact diff and hashes before retaining it.

Expose a manual button for the currently selected live actor and pass `expectedEnemyId`. Present the immutable result with a captured-at marker and actor identity, but leave the Bestiary species row/details static. Hide/clear when the result's `actorId` leaves the active battle/field population or area. Do not display max HP, alter Bestiary counters, or add a rotation control.

- [x] **Step 4: Run the focused tests to verify GREEN**

Run from `idle`: `pnpm test -- tests/senseContent.test.ts tests/sensePresentation.test.ts`

Expected: all metadata, command target, result visibility, and static-Bestiary separation assertions pass.

- [x] **Step 5: Run focused source closure, typecheck, and production build**

Run from `idle`: `pnpm test -- tests/senseInspection.test.ts tests/senseCommand.test.ts tests/senseContent.test.ts tests/sensePresentation.test.ts`, then `pnpm typecheck`, then `pnpm build`.

Expected: all four focused test files pass, TypeScript exits successfully, and Vite/server production build completes. Verify generated catalog and manifest hashes and the canary fixture with an actual legal Wizard/monster catalog pair; do not grant a real profile.

- [x] **Step 6: Preserve the shared working tree**

Do not stage or commit this shared dirty tree: it contains earlier project work outside this packet. The verified release archive is the deployment artifact; preserve all working-tree history in place.

---

## Pinned source reference

`410b9738c049ab1825d67b36b072d837c1d0b33a`:

- `db/pre-re/skill_db.conf:3699-3715` — Sense skill source definition.
- `src/map/skill.c:8434-8447` — live mob target restrictions and result call.
- `src/map/clif.c:6194-6229` — exact result packet and payload.
- `src/map/battle.c:7872` — `sense_type` default bits `1|2`.
- `src/map/status.c:3898-3933` — monster hard/soft field initialization and pre-renewal `VIT`/`INT` terms.
- `src/map/battle.c:1419-1434,1484-1511` — hard/soft defense meanings and damage-only percent processing boundary.
