FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN yarn build

FROM node:20-alpine
LABEL org.opencontainers.image.title="RechnungsAPI MCP server" \
      org.opencontainers.image.description="MCP server for RechnungsAPI (rechnungsapi.de), the ZUGFeRD & XRechnung API" \
      org.opencontainers.image.vendor="RechnungsAPI" \
      org.opencontainers.image.url="https://rechnungsapi.de" \
      org.opencontainers.image.documentation="https://rechnungsapi.de/api-docs#mcp-sdk" \
      org.opencontainers.image.source="https://github.com/Rechnungsapi/rechnungsapi-mcp" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
# yarn keeps a download cache of every package in the lockfile (~800 MB); the image doesn't need it.
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=build /app/dist ./dist

# The server only listens on a high port and writes nothing, so it has no use for root.
USER node
EXPOSE 3939
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3939/health || exit 1

CMD ["node", "dist/http.js"]
