FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/doc-sign/package.json ./apps/doc-sign/
COPY apps/registration/package.json ./apps/registration/
COPY apps/admin/package.json ./apps/admin/
COPY apps/kunk/package.json ./apps/kunk/
COPY packages ./packages

RUN npm install

COPY apps/doc-sign ./apps/doc-sign

WORKDIR /app/apps/doc-sign

ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

EXPOSE 4258

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4258"]
