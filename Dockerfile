FROM node:24-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node test ./test
USER node
CMD ["node", "src/server.mjs"]
