# Slow Grace (DC_DONTFORGETME) Design

## Goal
Implement the pre-renewal Dancer/Bard-area solo-hunt effect for Slow Grace, grounded in the pinned Hercules source at commit `410b9738c049ab1825d67b36b072d837c1d0b33a`.

## Source contract
- `db/pre-re/skill_db.conf`: level 1–10; self placed song; 7x7 square layout (`Layout: 3`); enemy target; 3,000 ms pulse; 180,000 ms duration; 20,000 ms out-of-area duration; 28 + 3 per level SP; instrument or whip required.
- `src/map/skill.c:13567-13576`: ASPD decrease is `DEX/10 + 3*skill level + 5 + DC_DANCINGLESSON`; movement reduction is `AGI/10 + 3*skill level + 5 + DC_DANCINGLESSON`.
- `src/map/status.c:5466-5468, 5859-5861`: the movement reduction contributes as a percentage; the ASPD value adds ten times its value to the source ASPD rate.
- `src/map/status.c:12570-12630`: while singing, drain 1 SP every 10 seconds; end the song when the SP charge fails.
- `db/pre-re/sc_config.conf:4235-4248`: SC_DONTFORGETME is NoSave/NoDeathReset and recalculates movement speed and ASPD.

## Behavior
- AFK rotation can place the song only with a learned skill, sufficient resources, and an equipped instrument or whip; the field is centered on the hero.
- Each 3-second pulse applies/refreshes the source-derived debuff to every living enemy occupying its cells. It deals no damage and does not become a self-buff.
- Enemies leaving the field keep the status for the source's 20-second grace period. The field ends after 180 seconds or when its periodic SP charge fails.
- Active debuffs slow the monster's next movement segments and subsequent attack intervals; no damage, loot, or reward formula changes.
- One active Slow Grace unit per battle; it expires/cleans up with the source clock.

## Non-goals
No other Bard/Dancer songs, party/link behavior, new character classes, PvP song interactions, or visual redesign in this packet.
