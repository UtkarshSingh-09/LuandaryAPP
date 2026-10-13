# 16 — DevOps, Hosting and Scaling

**Purpose:** Define how CampusLaundry is built, shipped, hosted, monitored, backed up and scaled: one Indian-region VPS running Docker Compose, with a written path from 40 concurrent users to 150+ and runbooks.

## Key Architecture
- **Single-VPS stack (Docker Compose)**:
  - `caddy:2.8-alpine`: TLS termination, reverse proxy, SSE-safe configuration (no buffering on `/api/v1/events/stream`), gzip/zstd on standard routes.
  - `web`: Next.js standalone container (port 3000).
  - `api`: FastAPI + Uvicorn (port 8000, 2-4 workers).
  - `worker`: Python background worker (cron jobs, sweeper, outbox drainer, reconciliation).
  - `migrate`: One-shot Alembic migration runner before API boots.
  - `postgres:16-alpine`: Port not exposed to host.
  - `redis:7-alpine`: Pub/sub, rate limiting, distributed locks, session cache.
- **External Services**:
  - S3-compatible Object Storage (AWS S3 Mumbai `ap-south-1`) for private media with pre-signed URLs.
  - Payment Gateways (PhonePe / Paytm / Mock).
  - Web Push via VAPID keys.
  - Sentry for error tracking.
  - SMTP provider for OTP emails.

## Caddy Configuration Highlights
- `/api/v1/events/stream`: `flush_interval -1`, no compression, `X-Accel-Buffering "no"`.
- `/api/*`: gzip/zstd, 1MB limit.
- Static & Next.js routes handled seamlessly on same origin `https://app.<domain>`.
- `/healthz` and `/readyz` for operational health.
