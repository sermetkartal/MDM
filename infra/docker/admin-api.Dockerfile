FROM node:20-alpine AS builder

WORKDIR /app

COPY services/admin-api/package.json services/admin-api/package-lock.json* ./
RUN npm ci --ignore-scripts

COPY services/admin-api/ .
RUN npm run build

FROM node:20-alpine AS deps

WORKDIR /app

COPY services/admin-api/package.json services/admin-api/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

FROM gcr.io/distroless/nodejs20-debian12

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

EXPOSE 3001

CMD ["dist/main.js"]
