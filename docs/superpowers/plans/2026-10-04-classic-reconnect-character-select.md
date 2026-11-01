# Classic Loading and Reconnect Character Selection Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Track the steps with the checkboxes below.

**Goal:** Give the full-screen loader a fitting local Ragnarok background and require a character selection before the world mounts on boot/reconnect, without pausing persistent AFK progression.

**Architecture:** The existing `useGame` session poll stays alive while a new presentation gate controls only the map and overlays. A dedicated single-profile selector renders the avatar from the existing catalog/profile; loading and selection are full-screen siblings above the hidden world. No server or schema change.

**Tech Stack:** React, TypeScript, CSS, existing local asset proxy, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-04-classic-reconnect-character-select-design.md`

## Global Constraints

- Preserve the single persistent local profile and all prior user work.
- Use only assets already available through the local asset service.
- Do not change the persisted hunting state or its offline cap.
- Keep the loading screen opaque and full-viewport.
- Do not add automated tests or dependencies.
- No profile wipe, commit, push, or publish.

## Review Focus

- Initial load vs. network recovery: only recovery after an established connection returns to character selection.
- `hunting` and `paused` profiles: selection must not dispatch a gameplay command or lose AFK status.
- Cached map readiness: clear the old readiness before mounting a newly selected session, preventing a flash of the unmounted map.
- Offline reward dialog: it must not enter the browser top layer above loading/selection.
- Desktop/mobile viewports: background preserves its aspect ratio and the single character and entry control remain reachable.

---

### Task 1: Full-screen loading artwork

**Files:**
- Modify: `idle/web/components/ClassicLoading.tsx`
- Modify: `idle/web/fullscreen.css`
- Modify: `idle/index.html`

**Interface:** Continue to accept the actual load `progress`, optional `error`, and `onRetry`; retain only art and percentage for normal loading.

- [x] Point `CLASSIC_LOADING_ART` and the HTML preload to the original client Rune-Midgard world-map image.
- [x] Layer a full-window, subdued blurred fill behind the original-aspect image so the whole map remains visible without cropping or distortion.
- [x] Retain the opaque root overlay, percent progress indicator, and recoverable error action.
- [x] Manually inspect loading in the available narrow viewport; verify the map fills the screen and no HUD/map/character leaks through.

### Task 2: Classic single-character selector and reconnect gate

**Files:**
- Create: `idle/web/components/CharacterSelect.tsx`
- Modify: `idle/web/App.tsx`
- Modify: `idle/web/fullscreen.css`

**Interface:** `CharacterSelect({catalog, snapshot, onEnter})` presents the only local persistent profile. `onEnter()` clears stale map readiness/dialogs and opens the existing world without sending a server command.

- [x] Render the current job's original client sprite, gender and identified equipped weapon in the selected card; show character name, job, Base/Job levels and hunt location/status.
- [x] Add local slot selection and an accessible “Entrar no mundo” action.
- [x] Gate world-scene mounting while no slot has been selected and world entry has not been requested.
- [x] Track established connectivity; when it recovers after a real disconnection, show selection again and close the previous UI dialogs.
- [x] Keep `useGame()` mounted so `/api/session` continues AFK advancement/snapshot updates throughout selection; do not issue a `stop` or `startHunt` command.
- [x] Defer `Offline` until after map entry/readiness so its modal cannot cover loading or character selection.
- [x] Inspect initial load, selection, entry and the AFK status in the browser; confirm the reconnect transition in code. Record the single-profile scope clearly in UI copy.

### Task 3: Integrate and deliver

**Files:**
- Verify: `docs/superpowers/specs/2026-10-04-classic-reconnect-character-select-design.md`
- Verify: `docs/superpowers/plans/2026-10-04-classic-reconnect-character-select.md`

- [x] Re-read the acceptance criteria and check each against the final diff.
- [x] Run the TypeScript typecheck and build the idle-game image.
- [x] Update the local idle-game Docker service.
- [x] Inspect the resulting selector and in-world state in the browser; verify the profile remains hunting and the mounted `/api/session` polling path calls the server's `advanceState` while the selector is open.
- [x] Record the single-profile limit; no multiple-character database support was added.

## Verification record

- `pnpm typecheck` completed successfully.
- `docker compose -p ragidle build idle-game` completed successfully.
- `docker compose -p ragidle up -d --no-deps idle-game` updated the local service; `/api/health` returned `{"status":"ok","catalogVersion":"0.1.0"}` and the container became healthy.
- Browser inspection showed the full-screen original Rune-Midgard parchment artwork with progress, followed by the single saved character selection. The existing profile appeared as `djow · Espadachim`, Base 30 / Job 21, `Caçando AFK em Sul de Prontera`; selecting it enabled entry. `useGame()` remains mounted and `/api/session` calls `advanceState` while the selector is open. Entering mounted the world and loaded the offline summary after map readiness.
- The currently available in-app browser viewport was narrow. Wide viewport layout is covered by the non-mobile CSS but was not separately inspected in a desktop-sized browser.
