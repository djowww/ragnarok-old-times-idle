# Ragnarok Old Times Idle

[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE) [![Docker](https://img.shields.io/badge/runtime-Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

**A browser-based Ragnarok Online idle adventure with classic Pre-Renewal progression and server-side offline progress.**

Ragnarok Old Times Idle is an independent, local-first fan project under active development. It pairs a dedicated idle game with Hercules and the roBrowserLegacy web client. Idle content is prepared from pinned Hercules sources; original maps, sprites, effects, icons and music are read from a Ragnarok client installed locally by each player.

[Português](README.md) · [Setup](#getting-started) · [Client assets](#ragnarok-client-assets) · [License](#license-and-attribution)

> This project is not affiliated with or endorsed by Gravity Co., Ltd. No Ragnarok Online GRFs, sprites, icons, maps, effects or music tracks are distributed here.

## Game features

- Server-authoritative idle combat with persisted progress and summaries for up to 12 hours offline.
- Ten explorable areas, monsters, MVPs and mini-bosses, quests, a bestiary and challenges.
- Classic class progression, rebirth, stats, skills, equipment, cards, refining, consumables and loot.
- Browser scenes using assets from the locally supplied client; background music follows the selected area when enabled.
- A classic roBrowserLegacy client connected to a local Hercules server.

The idle mode adapts progression and rewards for shorter sessions. It does not execute item scripts and does not aim to reproduce every system of the original emulator.

## Getting started

### Requirements

- Docker Desktop with Docker Compose v2.
- A compatible Ragnarok client that you are authorized to use. Client files are not included in this repository.

### Start the stack

From the repository root, copy the example environment file:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux, use `cp .env.example .env`. Replace the sample passwords in `.env`.

Then build and start the services:

```powershell
docker compose up --build -d
docker compose ps
```

Open the idle game at **http://localhost:3339/**. The classic client is at **http://localhost:3338/applications/pwa/index.html**. The first build compiles the services and may take several minutes.

## Ragnarok client assets

Client resources are read from `client-data/`, which is excluded from Git and mounted read-only in the containers. Copy files from a client installation you are authorized to use. At minimum, configure `client-data/DATA.INI` with compatible GRF archives and place each referenced file in the same directory:

```ini
[Data]
0=data.grf
```

Optional `data/`, `System/`, `BGM/` and `AI/` folders can supplement the archives. Compatibility depends on client version and layout. Restart and inspect the asset service after changing files:

```powershell
docker compose restart asset-service
docker compose logs -f asset-service
```

The application can start without local resources, but original maps, sprites, icons and music will be unavailable. Music is off by default and served locally; it is not included in Git or Docker images.

## Local services

| Address | Service |
| --- | --- |
| `http://localhost:3339/` | Idle game, API and resource proxy |
| `http://localhost:3338/` | roBrowserLegacy classic client |
| `http://127.0.0.1:8080/` | Local asset service |

MariaDB, Hercules and the WebSocket proxy communicate on the private Compose network. View logs or stop the stack with:

```powershell
docker compose logs -f idle-game database hercules web-client websocket-proxy asset-service
docker compose down
```

The database volume is preserved by `docker compose down`.

## Development

The idle package uses Node.js 24 and pnpm 11.25.0. With Docker running, execute these commands from `idle/`:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Vite serves the app at `http://localhost:5173/` and proxies API/assets to the local stack. Catalog selection and idle adaptations are documented in [`idle/content/`](idle/content/). The exporter verifies source hashes and treats item scripts as data; it never executes them.

## Troubleshooting

- **Black screen or loading stuck at 100%:** check `http://127.0.0.1:8080/api/health`, local GRFs and `docker compose logs -f asset-service web-client`.
- **Classic client cannot connect:** verify Hercules and the proxy are running, and that `PACKETVER` matches in the server and client.
- **Idle API unavailable:** check `http://localhost:3339/api/health` and `docker compose logs -f idle-game database`.
- **Missing map or sprite:** confirm the resource exists in your local client and that the asset service can read its archive.

## License and attribution

Project code and adapted GPL components are distributed under the **GNU GPL v3 or later**. See [`LICENSE`](LICENSE) and [`idle/THIRD_PARTY_NOTICES.md`](idle/THIRD_PARTY_NOTICES.md) for attribution and redistribution details.

Ragnarok Online and its visual and audio assets belong to their respective owners. The software license does not grant rights to those assets; provide only client files you are authorized to use.
