# Edge Gateway Lab (Cloudflare Workers)

Production-grade Edge API Gateway built with Cloudflare Workers.

## Features

-   Rate Limiting (Durable Objects + Sharding)
-   Canary Deployments
-   Feature Flags (KV)
-   Observability
-   Edge Caching
-   Circuit Breaker
-   Load Testing (k6)

## Architecture

Client → Cloudflare Worker → Backend

## Installation

### Requirements

-   Node.js 20+
-   Wrangler
-   k6

### Login

wrangler login

### Deploy

wrangler deploy

## Testing

### Health

curl https://edge-gateway.xxx.workers.dev/health

### Load Test

k6 run -e IS_EDGE=true -e BASE_URL=URL -e API_KEY=KEY
load-tests/k6-edge.js

## Credentials

Stored in wrangler.toml and Cloudflare Dashboard.
