# Stage 1: Build client
FROM node:20 as build-client

WORKDIR /build

COPY package.json package-lock.json ./
COPY tailwind.config.ts tailwind.css ./

RUN npm ci

COPY ./game/client/ ./game/client/

RUN npm run build-client

RUN find . -type d -name "node_modules" -prune -o -type f -print

# Stage 2: Build server
FROM golang:1.21-alpine as build-server

WORKDIR /build

COPY go.mod go.sum ./
COPY ./gecgos/ ./gecgos/

RUN go mod download

COPY main.go ./
COPY ./game/server/ ./game/server/
COPY ./api/ ./api/
COPY ./utils/ ./utils/

RUN go build .

RUN find .

# Stage 3: Run server
FROM alpine:latest

WORKDIR /app

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    # this is needed only if you want to use scp to copy later your pb_data locally
    openssh

# uncomment to copy the local pb_migrations dir into the container
# COPY ./pb_migrations /pb/pb_migrations

# uncomment to copy the local pb_hooks dir into the container
# COPY ./pb_hooks /pb/pb_hooks

COPY --from=build-client ./build/game/client/dist/ ./web/static/
COPY --from=build-server ./build/whirled2 ./

COPY ./web/ ./web/
COPY ./sql/ ./sql/

RUN find .

# start whirled2
CMD ["/app/whirled2", "serve", "--http=0.0.0.0:42069"]