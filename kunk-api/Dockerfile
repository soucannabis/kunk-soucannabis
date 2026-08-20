FROM node:20-bookworm-slim

WORKDIR /app

# bcrypt build deps + PostgreSQL 17 client (pg_dump/psql) — must match server major version
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 make g++ \
    postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=development
ENV PORT=4250
ENV HOST=0.0.0.0
# Prefer PG 17 binaries when multiple clients are present
ENV PG_DUMP_PATH=/usr/lib/postgresql/17/bin/pg_dump
ENV PSQL_PATH=/usr/lib/postgresql/17/bin/psql

EXPOSE 4250

# Hot-reload: nodemon reinicia a cada alteração em src/
CMD ["npx", "nodemon", "--legacy-watch", "--watch", "src", "--ext", "js,json", "src/server.js"]
