FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/

RUN bun build src/index.ts --outfile dist/index.js --target bun

FROM oven/bun:1-alpine
WORKDIR /app

COPY --from=builder /app/dist/index.js ./dist/index.js

EXPOSE 8080
CMD ["bun", "dist/index.js"]
