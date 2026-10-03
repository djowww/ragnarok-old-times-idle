# Idle gameplay refinement

## Intent and scope

Improve the existing local Ragnarok Old Times Idle without changing the Hercules/roBrowser setup or the saved `djow` profile. The approved review identified death recovery bypass, free encounter rerolls, enemy timing drift, unsafe challenge rest, weak potion selection, distorted shop stock, and misleading skill/quest UI. Add meaningful area decisions through recent hunt results and a weighted target preference.

## Combat and command rules

- Death imposes the existing 30 second recovery. `startHunt` cannot leave `resting`; `stop` during recovery only turns off auto resume and preserves the timer. `rest` during a challenge is rejected and disabled in the UI.
- Changing areas during an ordinary battle queues the destination until the battle ends. Reissuing the current area command does not reset the fight. A deliberate `stop` during an ordinary battle retreats immediately, spends 10 seconds recovering, and grants no kill or loot. Challenge surrender remains the existing explicit `stop` action.
- Preserve subsecond enemy attack deadlines by advancing from the scheduled deadline, with one attack per simulation tick. The existing minimum 1000 ms attack interval remains.
- Auto potion chooses the smallest available healing item that covers the missing HP/SP. If none covers it, choose the strongest available. HP retains priority when both thresholds fire. The actual chosen item remains visible in the combat journal.

## Economy

Remove slotted Cotton Shirt (2302) and Formal Suit (2320) from NPC shop stock. Already owned items remain owned. Their original Hercules prices and drop entries remain unchanged. Regenerate the catalog and source manifest from the fixed source.

## Hunt strategy and feedback

- Persist an optional per-area focus in the existing profile JSON. Choices are any monster, one monster present in that area, or one element present there. A match gets three times the normal encounter weight; focusing adds one second between encounters. No monster is guaranteed. Changing focus does not interrupt the current battle.
- Persist optional one-minute per-area activity buckets, retaining the last 15 minutes: time hunting, kills, defeats, base/job EXP, vendor value of loot plus direct zeny, damage taken, and potions consumed. Existing profiles without these fields start with empty history.
- Show recent base/job EXP per hour and potential zeny per hour only after at least one minute of observations; label them estimates. Show risk as low/moderate/high together with deaths and potion use from the same window. Areas with no recent observations show a collecting state. Focus and rates are visible in the map panel; the current focus is also shown beside the hunt controls.

## UI correctness

- The F1-F3 automatic bar follows `state.rotation` in priority order, including inherited skills. Remaining F slots are empty. Tooltips show cooldown and resource availability; clicking still opens the skill panel. The bar does not imply that pressing F casts manually.
- The journey card prioritizes unclaimed rewards that are ready, labels them as claimable, and otherwise displays the next incomplete objective with progress. The quest panel remains the place to claim rewards.
- During a challenge, the main rest control is unavailable. During a queued area change or retreat recovery, controls show the pending state clearly.

## Compatibility and verification

Keep the state schema version at 1 with new optional fields and nullish defaults; do not rewrite the existing MariaDB profile. Keep server validation authoritative for focus choices. Follow the higher-priority session instruction not to add or run tests. Verify by TypeScript checks, production build, clean diff, Docker health, and read-only browser inspection; report any behavior not observed live.
