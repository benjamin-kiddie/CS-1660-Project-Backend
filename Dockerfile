FROM node:22 AS builder

WORKDIR /app

COPY package*.json .
RUN npm install

COPY . .
RUN npm run build

FROM node:22-slim AS runtime

WORKDIR /app

COPY package*.json .
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["npm", "run", "prod"]