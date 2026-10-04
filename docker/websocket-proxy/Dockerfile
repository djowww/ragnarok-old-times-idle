FROM node:22-bookworm-slim

ARG ROBROWSER_REF=d88a3cd4acde0582530e3fc1908532a92e9accea

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# npm 10's peer resolver crashes on this revision's dependency graph.
RUN npm install --global npm@11.6.0 --no-audit --no-fund

WORKDIR /app
RUN git clone --filter=blob:none --no-checkout https://github.com/MrAntares/roBrowserLegacy.git . \
    && git checkout "${ROBROWSER_REF}" \
    && npm install --omit=dev --no-audit --no-fund \
    && chown -R node:node /app

COPY proxy-server.js /app/proxy-server.js

USER node
EXPOSE 5999
ENTRYPOINT ["node", "proxy-server.js"]
