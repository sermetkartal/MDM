FROM node:25-alpine AS builder

WORKDIR /app

COPY services/admin-console/package.json services/admin-console/package-lock.json* ./
RUN npm ci --ignore-scripts

COPY services/admin-console/ .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM gcr.io/distroless/nodejs20-debian12

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["server.js"]
