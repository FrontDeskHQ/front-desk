# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Start all services in development mode (web, api, worker, integrations)
bun dev

# Start local infrastructure (Postgres, Redis, Typesense, Qdrant)
docker compose up -d

# Build all packages
bun run build

# Type check all packages
bun run typecheck

# Lint all packages
bun run lint
```

### Per-App Commands

```bash
# API (apps/api)
bun run --filter api dev          # Dev mode with hot reload
bun run --filter api build        # Build with tsdown
bun run --filter api lint:fix     # Fix linting issues

# Web (apps/web)
bun run --filter web dev          # Dev mode (Vite)
bun run --filter web build        # Build for production
bun run --filter web deploy       # Deploy to Cloudflare

# Worker (apps/worker)
bun run --filter worker dev       # Dev mode with hot reload
bun run --filter worker start     # Run worker process

# Integration apps (discord, slack, github)
bun run --filter discord dev
bun run --filter slack dev
bun run --filter github dev
```

### Testing

```bash
# Run hybrid search evaluation (API)
bun run --filter api test:hybrid-search

# Run thread similarity evaluation (Worker)
bun run --filter worker eval:similarity
```

## Architecture Overview

FrontDesk is a monorepo customer support platform using Turborepo + Bun workspaces.

### Core Data Flow

```
User/Integration → API (Live-State) → PostgreSQL
                                    ↓
                              Redis (BullMQ)
                                    ↓
                              Worker Pipeline
                                    ↓
                         Qdrant (vector embeddings)
                                    ↓
                         Suggestions → WebSocket → UI
```

### Apps

- **api** (`apps/api`): Express server with Live-State real-time sync. Entry: `src/index.ts`
- **web** (`apps/web`): TanStack Start frontend with file-based routing. Entry: `src/router.tsx`
- **worker** (`apps/worker`): BullMQ job processor for thread ingestion pipeline. Entry: `src/worker.ts`
- **discord/slack/github** (`apps/*`): Integration bots that sync external messages to FrontDesk threads

### Packages

- **@workspace/ui**: shadcn/ui components, Tiptap editor, TailwindCSS v4
- **@workspace/schemas**: Shared Zod schemas for integrations
- **@workspace/emails**: Resend email templates
- **@workspace/utils**: Shared utilities including Tiptap markdown conversion

### Key Files

- `apps/api/src/live-state/schema.ts` - Database schema (organization, thread, message, label, suggestion, etc.)
- `apps/api/src/live-state/router.ts` - API routes and mutations
- `apps/api/src/lib/auth.ts` - Better-Auth configuration
- `apps/api/src/lib/queue.ts` - BullMQ job enqueuing
- `apps/web/src/lib/live-state.ts` - WebSocket client setup
- `apps/worker/src/pipelines/ingest-thread.ts` - Thread processing pipeline (summarize → embed → find similar)

### Real-Time Sync (Live-State)

The API exports its router and schema types that are consumed by other apps:
```typescript
// In web/worker apps
import type { Router } from "api/router";
import { schema } from "api/schema";
```

Live-State provides:
- WebSocket sync between API and clients
- One-time token authentication (via Better-Auth plugin)
- Reactive queries with local IndexedDB storage

### Worker Pipeline

Thread ingestion runs in 3 stages:
1. **Pre-processor**: LLM summarization (Google Gemini) → extracts title, keywords, entities
2. **Processor**: Generate embeddings → store in Qdrant
3. **Post-processor**: Similarity search → store related threads as suggestions

### Multi-Tenancy

Subdomain-based routing: `{org}.tryfrontdesk.app` rewrites to `/support/{org}/...` internally. All database queries filter by `organizationId` from auth context.

### Authentication Tiers

- **User sessions**: Better-Auth with email/password or Google OAuth
- **Portal sessions**: Separate auth instance for customer portal (`cookiePrefix: "portal-auth"`)
- **Public API keys**: Keypal-managed keys for external API access
- **Internal bot keys**: Discord/Slack bot authentication headers

## Code Style

- Biome for linting and formatting (double quotes, space indentation)
- TypeScript strict mode
- Zod for runtime validation
- Conventional Commits for git messages

## Environment Setup

Copy `apps/api/.env.local.example` to `apps/api/.env.local` and configure:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `TYPESENSE_API_KEY` - Search service
- `QDRANT_URL` - Vector database
- `GOOGLE_GENERATIVE_AI_API_KEY` - Gemini API for embeddings
- Auth provider credentials (Google OAuth, etc.)
