FROM node:20-bookworm-slim

RUN apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better caching
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Build once at image build-time; runtime only starts compiled app.
RUN npm run prisma:generate && npm run build

EXPOSE 4000

CMD ["sh", "-lc", "npx prisma migrate deploy && npm run start"]
