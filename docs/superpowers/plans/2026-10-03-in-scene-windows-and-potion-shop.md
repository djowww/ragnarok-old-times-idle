# In-Scene Windows and Potion Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Ragnarok idle HUD open original-looking windows within the game scene, place auto-potion thresholds beside HP/SP, and show the Prontera potion shop with original local assets.

**Architecture:** Keep the server snapshot and command API intact. Use one client-side active-window state in `App`, render the relevant existing panel in an overlay sibling of the map stage, and swap only the scene background while Shop is open. Use the GRF-backed asset service for all original images.

**Tech Stack:** React, TypeScript, CSS, roBrowserLegacy map viewer, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-03-in-scene-windows-and-potion-shop-design.md`

## Global Constraints

- Do not change idle save or command schemas.
- Do not copy GRF assets into Git or add runtime dependencies.
- The user already authorized implementation without process confirmations.
- Do not add or run automated tests; verify with typecheck, build, static review and browser inspection.

## Review Focus

- Narrow viewport: the window remains dismissible and its controls scroll within the game area.
- Remote snapshot updates: an open window remains stable; closing Shop restores the correct current combat map.
- Shops while hunting: opening the view does not send `stop`, and `buy` remains blocked until town.
- Potion editing: each threshold updates only its own field while retaining the other saved value.
- Quest celebration: initial loaded claimed quests do not trigger a fake completion.

---

### Task 1: Local map and shop scenery

**Files:** `idle/web/components/OriginalMap.tsx`, `docker/web-client/mapviewer-idle.patch`, new `idle/web/components/ShopScene.tsx`.

**Interfaces:** `ShopScene` accepts no server command; it renders `OriginalMap map="prt_in"` and the original NPC sprite. `OriginalMap` accepts the new allowlisted map. `App` imports `ShopScene` in Task 3.

- [x] Add `prt_in` to the two existing map allowlists, focus `[126,76]` in the map viewer patch.
- [x] Build `ShopScene` with the original Tool Dealer sprite and an accessible shop label.
- [x] Check the modified patch context against the pinned map viewer and inspect the component's rendered markup.

### Task 2: Distinct character panels and reward feedback

**Files:** `idle/web/panels/Build.tsx`, new `idle/web/components/QuestReward.tsx`.

**Interfaces:** `Build` accepts `mode?: "all" | "stats" | "skills"`, default `all`; `QuestReward` accepts a claimed quest and its catalog details plus `onClose`. `App` renders the right mode and detects newly claimed quests in Task 3.

- [x] Split existing Build display by `mode`, keeping the same commands and original `SkillIcon` entries.
- [x] Render a compact, dismissible quest reward card using catalog rewards and original item icons where available.
- [x] Review the two modes and reward component for keyboard/accessibility details.

### Task 3: In-scene navigation and controls

**Files:** `idle/web/App.tsx` and, if needed, a small window-shell component.

**Interfaces:** Uses `ShopScene`, `Build mode`, `QuestReward`; keeps existing panel props and server commands.

- [x] Replace below-page tab scrolling with one active game-window state and explicit menu destinations for Status, Equipment, Inventory, Skills, World, Quests, Bestiary, Classes, Challenges and Shop.
- [x] Move equipment and journey information into their corresponding game windows; keep combat journal and idle controls nearby.
- [x] Place red and blue item icon threshold controls beside HP/SP, preserving independent values and server save command.
- [x] Replace text hotbar shortcuts with original skill icons and a single sword item icon for basic attack.
- [x] Show reward feedback only on a newly claimed quest transition; support close and Escape.
- [x] Statically inspect every former tab destination and command button for reachability.

### Task 4: Classic visual treatment and responsive layout

**Files:** new `idle/web/experience.css`, `idle/web/main.tsx`; minimal scoped edits to existing CSS if needed.

- [x] Import the new stylesheet last; use the original `worldmap.jpg` as a subtle page background.
- [x] Style readable BMP menu buttons, HP/SP potion controls, in-scene windows, shop scene/NPC, reward card and desktop/mobile states.
- [x] Confirm the map remains the primary visual area and windows do not cover their own close buttons at desktop and narrow widths.

### Task 5: Integration and verification

**Files:** Any Task 1–4 file needed for integration fixes.

- [x] Run TypeScript typecheck and production build (no automated tests).
- [x] Rebuild/restart the local Docker web and idle services as needed.
- [x] Inspect localhost:3339 in browser at desktop and narrow widths; exercise menu, Shop, Stats, Skills, Inventory, threshold edit and quest claim when available.
- [x] Review the final diff for accidental server/save changes and report any fidelity limits.
