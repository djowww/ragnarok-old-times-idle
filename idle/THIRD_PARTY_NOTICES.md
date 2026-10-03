# Third party notices

The idle catalog contains selected data derived from **Hercules**, copyright
2014–2026 Hercules Dev Team, distributed under the **GNU GPL version 3 or later**.
Hercules is free software, without any warranty, including the implied warranties
of merchantability or fitness for a particular purpose. See `LICENSE` for the
complete license. Source: https://github.com/HerculesWS/Hercules at commit
`410b9738c049ab1825d67b36b072d837c1d0b33a`.

The SPR/ACT binary layout and decoding/composition code is adapted from
**roBrowser / roBrowserLegacy**, copyright Vincent Thibault and the
roBrowserLegacy contributors, under **GNU GPL version 3 or later**. It is provided
without warranty. Sources at commit `d88a3cd4acde0582530e3fc1908532a92e9accea`:

- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/Loaders/Sprite.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/Loaders/Action.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/DB/Jobs/JobNameTable.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/App/MapViewer.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/Renderer/MapRenderer.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/Renderer/Entity/EntityRender.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/DB/Jobs/WeaponAction.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/DB/Emotions.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/Renderer/Effects/Damage.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/DB/Effects/EffectTable.js
- https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/DB/Skills/SkillEffect.js

The local Docker build compiles the pinned roBrowserLegacy MapViewer with a
small idle-scene integration patch. Its WebGL renderer uses the original local
map assets through the asset service; the renderer remains GPL-3.0-or-later.

The BMP and small uncompressed TGA readers are original implementations. Earlier
BMP tests use generated tiny binary fixtures, with no official client pixels.

`content/source-manifest.json` records source hashes, selection, omitted drops,
source skills/classes, client resource-table hash, and explicit idle adaptations.
`content/rules.json` contains the reviewable selection and adaptation rules.
Hercules item script blocks are parsed as strings and are never executed.

Ragnarok Online artwork, item resource names, SPR/ACT files, icons, music and GRFs
are properties of their respective owners, including Gravity. Official binaries
are read from the locally installed client through the existing asset service.
No official sprite, icon, music or GRF binary is distributed in this repository or
its container image. Item resource paths are derived metadata; icon pixels remain
in browser memory. This license does not grant rights to proprietary client assets.

Application code and its adapted decoders/data are distributed under GPL-3.0-or-later.
