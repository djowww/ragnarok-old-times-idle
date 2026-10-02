# Local Browser Ragnarok Prototype Design

## Goal

Provide a local development stack where the classic Ragnarok client runs in a browser and connects to the Hercules server. The first playable milestone is: open the local page, log in, create or select a character, enter a map, and move around.

The project currently has no source files or commits. The user has Docker installed and approved the Hercules + roBrowserLegacy direction. Ragnarok client GRF files are not available yet, so map rendering and the full in-map acceptance check depend on the user later supplying a compatible client data directory.

## Scope

- Run locally through Docker Compose; this design does not cover public hosting.
- Use the official [Hercules repository](https://github.com/HerculesWS/Hercules) for login, character, and map services.
- Use [roBrowserLegacy](https://github.com/MrAntares/roBrowserLegacy) as the browser game client.
- Bridge browser traffic to Hercules with a WebSocket-to-TCP proxy.
- Serve the web client and game assets over HTTP.
- Run MariaDB as the local persistence service for Hercules.
- Keep proprietary client files outside the repository and Docker image.
- Do not add idle/offline progression, a custom web-game interface, trading, or public multi-user hosting in this milestone.

## Selected approach

Use the existing browser client and adapt its configuration to a local Hercules stack. This is the shortest path to classic Ragnarok gameplay in a browser. A custom client would give more control over the interface but require substantially more client and protocol work. A server-only setup would be smaller, but would not deliver browser gameplay.

The roBrowserLegacy setup guide lists Hercules as a supported emulator and describes the WebSocket proxy and client asset requirements. It recommends a client date before 2015 for the smoothest compatibility, while noting that this is not a hard restriction. The implementation must use one matching client/packet version across Hercules and roBrowserLegacy and disable packet obfuscation for this client setup.

## Architecture and data flow

```text
Browser
  ├── HTTP ──> Web client service (roBrowserLegacy)
  ├── HTTP ──> Asset service ──> local, user-supplied GRF directory
  └── WebSocket ──> WebSocket proxy ──TCP──> Hercules login/char/map services
                                                        │
                                                        └──> MariaDB
```

The web client loads its interface and game resources over HTTP. Game login and gameplay packets travel through the WebSocket proxy, which forwards them to the Hercules TCP services on the private Docker network. Hercules stores accounts and characters in MariaDB.

## Local services

- **database:** MariaDB with a named Docker volume for local account and character data. It is not published to the host.
- **hercules:** built from the official source in a Docker image. The packet version and database connection are configured for the selected client data. The login, character, and map services wait for database readiness.
- **web-client:** serves roBrowserLegacy as a browser-accessible page.
- **websocket-proxy:** accepts the browser's WebSocket connection and forwards packets to the Hercules services.
- **asset-service:** serves client resources from a host directory mounted read-only. The directory is ignored by Git and is never copied into the image.

The browser-facing HTTP and WebSocket ports bind to localhost for this development stack. Internal services communicate over the Compose network.

## Client data and compatibility

The repository will contain configuration and setup instructions only; it will not contain or download GRFs. A local ignored directory will be mounted into the asset service when the user obtains client files. The README will state where to place the files and how to choose a matching packet version. The chosen version must be set consistently in the Hercules build and roBrowserLegacy configuration.

Until those files are present, the stack can provide the local web page and server infrastructure, but cannot satisfy the in-map visual gameplay milestone. The page or startup instructions should report the missing client data clearly.

## Configuration and operations

- Keep non-secret local defaults in tracked configuration and provide an example environment file for overrides.
- Keep real passwords and user-provided client data out of Git.
- Document startup, shutdown, logs, account setup, client data placement, and the matching packet-version setting in a Portuguese README.
- A normal local session starts with Docker Compose and opens the documented localhost URL in a browser.

## Failure handling

- Database health must gate Hercules startup so the game servers do not race MariaDB initialization.
- A missing or unreadable GRF directory must produce a clear setup message rather than an unexplained asset loading failure.
- Packet/client mismatches should be diagnosable from documented Hercules and proxy logs; the README will identify packet version and obfuscation as the first compatibility checks.

## Acceptance criteria

1. Docker Compose can build and start the local services without requiring a host installation of MariaDB or a native Hercules build toolchain.
2. The browser can load the locally served roBrowserLegacy page.
3. With a compatible user-supplied client data directory, the browser can connect through the proxy, authenticate, create or select a character, enter a map, and move.
4. Without client data, setup instructions explain the missing prerequisite and no proprietary assets are fetched or committed.
5. The stack remains local-only by default; the database port and Hercules internal ports are not exposed publicly.

## Out of scope

- Public deployment, HTTPS/WSS production configuration, or internet-facing account security.
- A new browser rendering engine or a redesigned game UI.
- Idle hunting, offline progression, custom marketplace, guild, or monetization features.
- Bundling, downloading, or redistributing Ragnarok client assets.

## References

- [Hercules source repository](https://github.com/HerculesWS/Hercules)
- [roBrowserLegacy setup guide](https://github.com/TitanRO/browserLegacy/blob/master/doc/README.md)
- [roBrowserLegacy project](https://github.com/MrAntares/roBrowserLegacy)
