FROM node:20-slim AS base

WORKDIR /app

# 1. Copy package files
COPY package.json package-lock.json ./

# 2. Copy local package
COPY erp-utils ./erp-utils

# 3. Install dependencies
RUN npm ci

# 4. Build erp-utils first
WORKDIR /app/erp-utils
RUN npm install && npm run build

# 5. Build app
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 6. Run
CMD ["node", "dist/server.js"]
