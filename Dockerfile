FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY --chown=node:node src ./src
COPY --chown=node:node test ./test
COPY --chown=node:node scripts/api-demo.js ./scripts/api-demo.js
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
