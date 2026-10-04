FROM node:22-bookworm-slim

ARG REMOTE_CLIENT_REF=0dd3a3fa71733c0c88ac1beb117039174eb2a7b0

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN git clone --filter=blob:none --no-checkout https://github.com/FranciscoWallison/roBrowserLegacy-RemoteClient-JS.git . \
	&& git checkout "${REMOTE_CLIENT_REF}" \
	&& npm ci --omit=optional --no-audit --no-fund \
	&& chown -R node:node /app

ENV PORT=8080 \
	CLIENT_PUBLIC_URL=http://localhost:3338 \
	ENABLE_WSPROXY=false \
	ENABLE_STATIC_SERVE=false \
	NODE_ENV=production \
	CACHE_WARM_UP=false

COPY no-assets-server.js /app/no-assets-server.js
COPY entrypoint.sh /usr/local/bin/asset-entrypoint
RUN chmod 0755 /usr/local/bin/asset-entrypoint

USER node
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/asset-entrypoint"]
