FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile || npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
