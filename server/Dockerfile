FROM node:20-bookworm-slim

RUN apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better caching
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Prisma client generation (does not require DB)
RUN npx prisma generate

EXPOSE 4000

# NOTE: initial boot uses prisma db push to get running.
# Replace with `prisma migrate deploy` once migrations are committed.
CMD ["sh", "-lc", "npx prisma db push && npm run dev"]
