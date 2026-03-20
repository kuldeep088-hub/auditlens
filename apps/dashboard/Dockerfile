FROM node:20-slim AS builder

WORKDIR /app

COPY apps/dashboard/package.json ./
RUN npm install

COPY apps/dashboard/ ./
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
