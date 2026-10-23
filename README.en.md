![RagIDLE — Ragnarok Old Times Idle](docs/assets/banner.svg)

# RagIDLE · v1.0

**Classic Ragnarok, at your own pace.** A browser idle RPG with automatic hunting, character progression and equipment management.

This is the **original RagIDLE project**, developed separately from Ragnarok Restart.

[**Play the public preview →**][preview] · [**Windows downloads →**](https://github.com/djowww/ragnarok-old-times-idle/releases/latest) · [Português](README.md)

## Play

Create an account, select your saved character and choose a hunting area. Your character finds monsters, walks to targets and fights automatically. Configure skill priority, attributes and equipment to progress. Enable music in game.

The preview requires no server installation. It is a test environment; availability and progress may change. Preview accounts were reset for this release.

## Included

- 38 hunting areas, including fields and dungeons, with map collision and respawns.
- 40 classes in the progression trees, Base/Job levels, attributes and rebirth.
- Server-authoritative combat, skill casting, cooldowns and automatic rotations.
- 348 imported skills: **298 marked supported, 50 unavailable**.
- Inventory, cards, rarity, identification, bulk identification and refinement.
- 81 boss/mini-boss challenges and 8 progression quests in the catalog.
- Up to 12 hours of offline progress, a combat journal and global chat.
- Prontera shop, blacksmith, stylist and a city HUD shortcut.
- Movable windows, minimap, accounts, character selection and ranking.
- Key-protected administration with action auditing.

Counts are taken from the [versioned catalog](idle/content/catalog.json). Supported status does not imply complete reproduction or manual verification of every original Ragnarok effect.

## Still to come

Unavailable skills and missing partner/guild/map-object mechanics; PvP/WoE; parties, guilds and player trading; broader NPC quest chains; further animation, navigation, performance and balance work.

See the [roadmap](docs/ROADMAP.md) and [skill coverage](docs/SKILL_COVERAGE.md). v1.0 is the first organized public release, not a claim that every Ragnarok system is complete.

## Windows

Download a ZIP from [Releases](https://github.com/djowww/ragnarok-old-times-idle/releases/latest):

- **Windows Preview:** extract and run `Jogar-Preview.cmd` to open the hosted game.
- **Windows Local:** extract and run `Iniciar-RagIDLE.cmd`. Requires Docker Desktop using Linux containers and legally obtained compatible client assets. Opens `http://localhost:3339/`.
- `Parar-RagIDLE.cmd` stops only the local RagIDLE installation and preserves its database.

The local package contains source and a launcher; it is not a standalone native Windows executable. See the [Windows guide](docs/WINDOWS.md), [setup](docs/SETUP.md), [development](docs/DEVELOPMENT.md), [changelog](CHANGELOG.md) and [contribution guide](CONTRIBUTING.md).

## License

Independent fan project, not affiliated with or endorsed by Gravity Co., Ltd. Code: **GPL v3 or later**. See [LICENSE](LICENSE) and [third-party notices](idle/THIRD_PARTY_NOTICES.md).

Original client maps, sprites, effects, icons and music are not included in the repository or Windows packages. Operators must supply client resources they are entitled to use.

[preview]: https://15.204.210.74:8443/
