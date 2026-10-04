FROM node:22-bookworm AS builder

ARG ROBROWSER_REF=d88a3cd4acde0582530e3fc1908532a92e9accea

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# npm 10's peer resolver crashes on this revision's dependency graph.
RUN npm install --global npm@11.6.0 --no-audit --no-fund

WORKDIR /app
RUN git clone --filter=blob:none --no-checkout https://github.com/MrAntares/roBrowserLegacy.git . \
    && git checkout "${ROBROWSER_REF}" \
    && npm install --no-audit --no-fund

# Keep the upstream revision and its attribution; adapt only its idle viewer.
COPY mapviewer-idle.patch /tmp/mapviewer-idle.patch
RUN git apply /tmp/mapviewer-idle.patch \
    && npm run build:pwa \
    && cp dist/Web/index.html /tmp/robrowser-pwa-index.html \
    && npm run build:mapviewer \
    && cp /tmp/robrowser-pwa-index.html dist/Web/index.html

FROM nginx:stable-alpine

RUN apk add --no-cache gettext

COPY --from=builder /app/dist/Web/ /usr/share/nginx/html/applications/pwa/
COPY map-idle.html /usr/share/nginx/html/applications/pwa/map-idle.html
COPY Config.local.js.template /opt/web-client/Config.local.js.template
COPY entrypoint.sh /usr/local/bin/web-client-entrypoint

RUN chmod 0755 /usr/local/bin/web-client-entrypoint

EXPOSE 80
ENTRYPOINT ["/usr/local/bin/web-client-entrypoint"]
