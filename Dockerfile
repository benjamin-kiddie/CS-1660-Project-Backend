FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json .
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json .
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["npm", "run", "prod"]