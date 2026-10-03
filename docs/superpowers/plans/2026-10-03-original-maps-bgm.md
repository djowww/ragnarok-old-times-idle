# Original Maps and BGM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the original local Ragnarok map scenery and correct map BGM in the idle browser, and make the Aprendiz attack ACT visible for each hit or miss.

**Architecture:** Build the pinned roBrowserLegacy MapViewer into the existing web-client image, with a minimal patch that auto-initializes its remote client and loads one whitelisted map from the URL fragment. Embed it behind the existing idle sprite Canvas. Select audio from a versioned map-to-track table derived from the local GRF. Trigger combat poses from server events rather than battle-presence heuristics.

**Tech Stack:** Docker Compose, roBrowserLegacy WebGL/worker, React 19/TypeScript Canvas2D, local GRF remote client, HTML audio.

**Spec:** `docs/superpowers/specs/2026-10-03-original-maps-bgm-design.md`

## Global Constraints

- Keep the idle engine/server state and classic PWA intact.
- Use roBrowserLegacy commit `d88a3cd4acde0582530e3fc1908532a92e9accea` and local `client-data/`; commit no GRF, MP3 or extracted proprietary pixels.
- Eleven map names are limited to `prontera` and the ten `catalog.areas[].map` values.
- Audio remains opt-in and switches tracks without silently re-enabling after the user pauses it.
- The current developer instruction prohibits adding or running automated tests unless the user requests testing; inspect builds and live behavior for this delivery.

## Review Focus

- Worker must initialize its remote client before MapRenderer requests GRF data.
- Switching a map must not leave the previous map visible under a wrong location label.
- Missing maps/WebGL must show a recoverable error, not a claim of original scenery.
- Killing blows and misses must still animate the Aprendiz after the battle snapshot changes.
- Audio failures or autoplay rejection must leave a usable play control.

---

### Task 1: Serve the original MapViewer for idle scenes

**Files:** `docker/web-client/Dockerfile`, `docker/web-client/mapviewer-idle.patch`, `docker/web-client/map-idle.html`.

**Interfaces:** `GET http://localhost:3338/applications/pwa/map-idle.html#<map>.rsw` renders one original map using `http://127.0.0.1:8080/` assets and emits `{type:'ragidle-map-ready',map}` or `{type:'ragidle-map-error',map}` to the parent.

- [x] Patch the pinned MapViewer so `idleScene` starts `Client.init([])` without Intro/dropdown, chooses its whitelisted URL map and posts ready/error. Preserve its normal PWA and viewer behavior.
- [x] Build MapViewer and PWA in the Docker builder while retaining both bundles plus `ThreadEventHandler.js`. Copy a dedicated minimal HTML launcher into the Nginx document root.
- [x] Build only `web-client`, then inspect the served launcher, bundle and map asset responses and observe an actual WebGL map in a browser.

### Task 2: Put original scenery behind the idle actors

**Files:** create `idle/web/components/OriginalMap.tsx`; modify `idle/web/components/Scene.tsx`, `idle/web/styles.css`.

**Interfaces:** `<OriginalMap map={string} />` accepts a whitelisted catalog map or `prontera`; on URL change, remounts the viewer and waits for the matching ready message. Scene Canvas renders actors and HUD with a transparent background.

- [x] Mount a local MapViewer iframe using the current area map and `prontera` in town, with explicit origin/source checks on status messages and an error/retry control.
- [x] Remove the painted landscape from the normal scene, keep the Canvas transparent over the WebGL layer, and retain actor/UI readability at desktop and mobile widths.
- [x] Inspect city and at least two different hunting maps in the browser and confirm the scene changes with the location.

### Task 3: Select the original music for each map

**Files:** create `idle/web/components/mapBgm.ts`; modify `idle/web/components/AudioToggle.tsx`, `idle/web/App.tsx`, `README.md`.

**Interfaces:** `bgmForMap(map: string): string | undefined` maps the eleven locations to filenames in `BGM/`. `<AudioToggle map={string} />` starts on user gesture, tracks map changes, pauses and retries.

- [x] Implement the table exactly as the local `data/mp3nametable.txt` entries in the spec and pass the active map from App.
- [x] Retain explicit play/pause preference across map changes, switch only when the filename changes, handle `play()` rejection, and cancel timers/listeners at unmount.
- [x] Confirm music stays active across a map change in the browser, both local MP3 endpoints return 200, and README states the local-source requirement.

### Task 4: Animate Aprendiz attacks from combat events

**Files:** modify `idle/web/components/Scene.tsx`; modify `idle/web/assets/renderer.ts` only if necessary.

**Interfaces:** on new `damage` targeting enemy or a player `miss` event, start the PC attack action 40 at elapsed 0; show its 5 × 100 ms frames independent of current battle presence. The same cues should work for other jobs whose ACT has that action.

- [x] Add event cues that include hits, misses and killing blows; keep damage numbers separate.
- [x] Use cue-relative elapsed milliseconds for the attack pose, settle priority with received damage by recency, and preserve the last opponent briefly on a killing blow.
- [x] Inspect a live Aprendiz finishing hit in the browser, confirm miss cues in code and journal, and inspect the five-frame ACT asset.

### Task 5: Integrate and finish the local delivery

**Files:** `README.md`, `idle/THIRD_PARTY_NOTICES.md` as needed.

- [x] Rebuild `web-client` and `idle-game`, inspect service health and the browser at `http://localhost:3339/` for city, two fields, a dungeon, music and attack.
- [x] Inspect `git diff` for accidental official assets, review error handling, commit implementation on `codex/ragnarok-browser-local`, and report the exact playable URL and limits honestly.
