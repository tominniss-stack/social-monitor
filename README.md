# Centralised Community & Content Intelligence Dashboard (Aether Intelligence)

A production-grade internal web application for ingesting Facebook Page and Instagram Business comments (both organic and paid/dark ad posts) in real time via Meta Graph API Webhooks, triaging them using an LLM with Structured Outputs, drafting human-in-the-loop replies, synchronising bi-directional reply states, and clustering recurring customer questions into actionable content briefs.

Designed with a platform-agnostic relational schema ready for LinkedIn (Phase 2) and TikTok (Phase 3).

---

## Features

- **Multi-Channel & Dark Ad Support**: Unified inbox for Facebook Pages and Instagram Business Accounts, handling both organic feed comments and dark/paid ad posts (resolving via `effective_object_story_id`).
- **Real-Time Webhook Pipeline (< 100ms)**: Cryptographic HMAC-SHA256 signature verification via `X-Hub-Signature-256`, hub challenge handshake handling, and asynchronous event ingestion well within Meta's 3-second SLA.
- **Bi-Directional Native State Sync**: Automatically detects replies sent by team members natively on Facebook or Instagram mobile apps, links them into comment threads, and marks parent triage records as `ANSWERED`.
- **LLM Triage & Draft Engine**: Classifies comments into Priority (`P1_CRITICAL` through `P4_LOW`), Category (`LEAD_ENQUIRY`, `PRODUCT_QUESTION`, etc.), Sentiment, reasoning, and pre-drafts replies matching brand guidelines (UK English).
- **Human-in-the-Loop Composer**: Review, edit, approve, or adjust draft tones (*"Shorter"*, *"More Empathetic"*, *"Include CTA"*), and publish directly back to Meta via the Graph API.
- **GDPR Compliance**: Hard-deletes comment data immediately when Meta sends `verb: "remove"` events.
- **Content Intelligence & Clustering**: Semantic grouping of customer inquiries and pain points over a rolling 30-day window using `pgvector` embeddings to synthesise actionable social content briefs.
- **SLA Analytics**: Tracks median Time-to-First-Response (TTFR) by priority, ingestion latency, AI classification override rate, and sentiment distributions.
- **Interactive Webhook Simulator**: Built-in testing suite to simulate realistic scenarios (Paid Ad Lead, Feature Question, Support Outage, Native Mobile Reply Sync, GDPR Deletion) without live Meta traffic.
- **Full Dark Mode**: System-aware and persistent light/dark mode with custom scrollbars and zero white-flash on page load.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript, Server Actions & Route Handlers)
- **Styling**: Tailwind CSS, Lucide icons
- **Database & ORM**: PostgreSQL with `pgvector` extension, managed via Prisma ORM
- **AI / LLM Layer**: Vercel AI SDK (`ai` + `@ai-sdk/openai`), OpenAI `gpt-4o-mini` / `gpt-4o` with fallback deterministic classifiers
- **Validation**: Zod for structured outputs, webhook payloads, and API schemas

---

## Getting Started

### 1. Prerequisites
- Node.js 18+ (Node 20+ recommended)
- Docker (for PostgreSQL + pgvector)

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your credentials in `.env`:
- `DATABASE_URL`: PostgreSQL connection string with `pgvector`
- `META_APP_ID`, `META_APP_SECRET`: Meta Developer App credentials
- `META_WEBHOOK_VERIFY_TOKEN`: Verification token matching your Meta Webhook configuration
- `META_SYSTEM_USER_ACCESS_TOKEN`: Non-expiring System User Access Token with required permissions
- `OPENAI_API_KEY`: OpenAI API key (optional for local testing; deterministic fallbacks provided)

### 3. Start PostgreSQL with pgvector
```bash
docker run -d --name social-monitor-postgres -p 5435:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=community_dashboard \
  pgvector/pgvector:pg16
```

### 4. Database Setup & Seeding
```bash
npx prisma db push
npx prisma db seed
```

### 5. Run the Application
```bash
# Development
npm run dev

# Production Build
npm run build
npm run start
```
The application will be accessible at [http://localhost:3005](http://localhost:3005).

---

## Webhook Endpoints & Simulation

- **Live Webhook Endpoint**: `GET /api/webhooks/meta` (Handshake verification) & `POST /api/webhooks/meta` (Live events)
- **Interactive Simulator**: Accessible via the **"Simulate Webhook"** button in the header or at `POST /api/webhooks/simulate`.
