# syntax=docker/dockerfile:1
# Cooper Waters admin dashboard: build static files with Node, serve them with nginx.
#   docker build -t cooper-waters-admin --build-arg VITE_API_BASE_URL=https://api.example.com .
#   docker run -p 8080:80 cooper-waters-admin

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Vite bakes these into the bundle at build time.
ARG VITE_API_BASE_URL=http://localhost:3100
ARG VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
ARG VITE_MAP_ATTRIBUTION="&copy; OpenStreetMap contributors"
ARG VITE_BASE_PATH=/
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL \
    VITE_MAP_ATTRIBUTION=$VITE_MAP_ATTRIBUTION \
    VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build

FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
