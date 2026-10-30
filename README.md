# Centralised Community & Content Intelligence Dashboard (Aether Intelligence)

A production-grade internal web application for ingesting Facebook Page and Instagram Business comments (both organic and paid/dark ad posts) in real time via Meta Graph API Webhooks, triaging them using an LLM with Structured Outputs, drafting human-in-the-loop replies, synchronising bi-directional reply states, and clustering recurring customer questions into actionable content briefs.

Designed with a platform-agnostic relational schema ready for LinkedIn (Phase 2) and TikTok (Phase 3).

---

## Features

- **Multi-Channel & Dark Ad Support**: Unified inbox for Facebook Pages and Instagram Business Accounts, handling both organic feed comments and dark/paid ad posts (resolving via `effective_object_story_id`).
- **Real-Time Webhook Pipeline (< 100ms)**: Cryptographic HMAC-SHA256 signature verification via `X-Hub-Signature-256`, hub challenge handshake handling, and asynchronous event ingestion well within Meta's 3-second SLA.
- **Bi-Directional Native State Sync**: Automatically detects replies sent by team members natively on Facebook or Instagram mobile apps, links them into comment threads, and marks parent triage records as `ANSWERED`.
- **LLM Triage & Draft Engine**: Classifies comments into Priority (`P1_CRITICAL` through `P4_LOW`), Category (`LEAD_ENQUIRY`, `PRODUCT_QUESTION`, etc.), Sentiment, reasoning, and pre-drafts replies matching brand guidelines (UK English). Status mapping follows the spec: `requiresHumanReply` → `DRAFT_READY` (draft present) / `NEEDS_REPLY` (no draft), otherwise `IGNORED`; comments matching the brand's escalation rules (model `escalate` flag, or a `P1_CRITICAL` `COMPLAINT_SUPPORT`) land in `ESCALATED`.
- **Dark-Post Resolution & Rate-Limit Backoff**: Facebook ad-object post IDs are resolved via `effective_object_story_id` (requires `ads_read`) and flagged `isPaidAd`; `x-app-usage` / `x-business-use-case-usage` headers drive a 60s cooldown at ≥ 90% utilisation and `Retry-After` is honoured on 429/503 (`getRateLimitStatus()` exposes the live figures).
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
- **Background Queue**: Inngest (`comment/ingested` → durable function with retries, served at `/api/inngest`)
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
npm run db:vector-index   # HNSW cosine index on Comment.embedding (idempotent; skipped if pgvector/HNSW unavailable)
npx prisma db seed
```
The vector index is created by `scripts/setup-vector-index.ts` because the `embedding` column is `Unsupported("vector(1536)")` and the project uses `db push` rather than migration files.

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

## Authentication (Cloudflare Access)

Identity is provided at the edge by **Cloudflare Access (Zero Trust)** and independently re-verified inside the app by `src/middleware.ts`, so a leaked origin or misconfigured bypass never becomes an open door. The provider is pluggable (`src/lib/auth/`) — swapping to Auth.js later is a single file plus an env var (see `plans/auth-wireframe.md`).

### How it works

1. Cloudflare Access enforces login for the dashboard hostname and injects a `Cf-Access-Jwt-Assertion` JWT (also set as the `CF_Authorization` cookie).
2. `src/middleware.ts` runs on every request except static assets. Paths in `PUBLIC_PATHS` (`src/lib/auth/public-paths.ts`) pass through and self-verify with their own secret; everything else must present a JWT that validates against `https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs` with the correct issuer and `CF_ACCESS_AUD`.
3. Unauthenticated `/api/*` requests get `401 { error: "Unauthenticated" }`; unauthenticated pages redirect to `/auth/denied`.
4. On success the middleware strips any client-supplied `x-user-*` headers and sets verified `x-user-email` / `x-user-name` / `x-user-groups`. Route handlers read these via `getCurrentUser()` / `requireUser()` in `src/lib/auth/session.ts`.
5. Client code uses `apiFetch()` (`src/lib/api-client.ts`) which reloads the page when an Access session has expired (opaque redirect / 401 / non-JSON response).

The app **fails closed**: in production it refuses to boot if `AUTH_PROVIDER=dev`, if `AUTH_PROVIDER` is unknown, or if `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` are missing.

### Cloudflare-side checklist

1. **Zero Trust → Access → Applications** → add a *Self-hosted* application for the dashboard hostname.
2. **Allow policy**: agency staff emails or your IdP group.
3. **Bypass policies** (separate application entries or path-scoped policies) for *exactly* the public paths — these must mirror `PUBLIC_PATHS`:
   - `/api/webhooks/meta` — verified by Meta's `X-Hub-Signature-256` HMAC (`META_APP_SECRET`)
   - `/api/inngest` — verified by `INNGEST_SIGNING_KEY`
   - `/api/cron/*` — verified by `Authorization: Bearer ${CRON_SECRET}` (or an Access service token)
4. **WAF**: skip managed challenges for `/api/webhooks/meta` — Meta's servers cannot solve a challenge.
5. **Origin lockdown**: serve the origin through a **Cloudflare Tunnel** (`cloudflared`) so it has no public ingress. Access is only as strong as the origin lockdown.
6. Copy the application **AUD tag** from the Access dashboard into `CF_ACCESS_AUD`, and set `CF_ACCESS_TEAM_DOMAIN` to `<team>.cloudflareaccess.com`.
7. Optional: create a **service token** for the cron caller.

### Environment variables

| Variable | Purpose |
|---|---|
| `AUTH_PROVIDER` | `cloudflare-access` (default in production) or `dev` (default otherwise; refused in production) |
| `CF_ACCESS_TEAM_DOMAIN` | e.g. `your-team.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Access application audience tag |
| `DEV_USER_EMAIL` | Identity used by the `dev` provider (default `dev@localhost`) |
| `ENABLE_SIMULATOR` | Set to `true` to allow `/api/webhooks/simulate` in production; always enabled outside production |

### Local development

Cloudflare Access is absent on `localhost`. Set `AUTH_PROVIDER=dev` (or leave it unset — it is the default when `NODE_ENV !== 'production'`) and every request is treated as `DEV_USER_EMAIL`. The dev provider throws if it is ever instantiated in production.

To exercise the real Cloudflare provider locally, set `AUTH_PROVIDER=cloudflare-access` with your team domain and AUD and send a valid `Cf-Access-Jwt-Assertion` header (e.g. via `cloudflared access curl`).

### Workspaces & roles

Authorisation is a `Membership` row joining the verified email to a `Workspace` with a role (`VIEWER` < `MANAGER` < `ADMIN`); there is no user/password table. `requireMembership(minRole)` (`src/lib/auth/workspace.ts`) gates every dashboard route and scopes data to the caller's workspace. The seed creates the `default` workspace (`Aether Agency`) with `DEV_USER_EMAIL` as `ADMIN`; in non-production the dev identity auto-resolves to that workspace even before seeding. Unknown emails receive `403 { error: "Forbidden" }`.

| Role | Allowed |
|---|---|
| `VIEWER` | Read inbox, insights, analytics, health, settings |
| `MANAGER` | + reply / tone / triage / hide / delete / bulk actions, generate insights, run the simulator |
| `ADMIN` | + update brand voice settings |

Every mutating action writes an `AuditLog` row (`actorEmail`, `action`, `targetType`, `targetId`, `metadata`) via `writeAudit()` in `src/lib/audit.ts`.

---

## Rate Limiting & Abuse Protection

Per-IP / per-user rate limiting is handled at the edge with **Cloudflare WAF rate-limiting rules** (Security → WAF → Rate limiting rules) rather than in the app. Recommended starting rules for the LLM-backed and write-heavy endpoints:

| Path | Rule | Rationale |
|---|---|---|
| `POST /api/insights/generate` | 10 requests / minute / IP | Each run can call `gpt-4o` plus up to 50 embeddings |
| `POST /api/comments/*/tone` | 30 requests / minute / IP | One `gpt-4o` call per click |
| `POST /api/webhooks/simulate` | 30 requests / minute / IP | Triggers a full pipeline run (`gpt-4o-mini` + embedding) |
| `POST /api/comments/*/reply`, `/visibility`, `DELETE /api/comments/*` | 60 requests / minute / IP | Outbound Meta writes; protects the Graph API budget |
| `POST /api/comments/bulk` | 20 requests / minute / IP | Up to 50 Meta hide calls per request |

Set the action to *Block* (or *Managed Challenge* for browser-facing paths) with a 1-minute period. Do **not** rate-limit `/api/webhooks/meta` below Meta's burst rate, and never apply a challenge to it.

### Daily OpenAI spend guard

Independently of the edge, the app enforces a **daily OpenAI call budget** (`src/lib/llm-budget.ts`). Every OpenAI-backed path (`triage`, `tone`, `clustering`, `embedding`) calls `assertBudget()` which atomically increments `LlmUsageDay` (UTC day) and throws once the count exceeds `LLM_DAILY_CALL_LIMIT`:

| Variable | Default | Effect |
|---|---|---|
| `LLM_DAILY_CALL_LIMIT` | `500` | Max OpenAI calls per UTC day across all kinds |

When exceeded: triage falls through to the deterministic classifier (logged), tone regeneration returns `429 { error: "Daily AI budget exceeded" }`, clustering uses template synthesis and embeddings use the hashed fallback. If the budget table is unreachable the guard **fails open** with a warning — the budget must never block the ingestion pipeline.

---

## Webhook Endpoints & Simulation

- **Live Webhook Endpoint**: `GET /api/webhooks/meta` (Handshake verification) & `POST /api/webhooks/meta` (Live events). The `X-Hub-Signature-256` HMAC is **always** verified against `META_APP_SECRET`; the handshake requires `META_WEBHOOK_VERIFY_TOKEN` to be set. Neither has a fallback value. Payloads are validated against discriminated `page` / `instagram` zod schemas (`src/lib/validation.ts`) and mapped to pipeline events by the pure `parseMetaWebhookPayload()` in `src/lib/services/meta-webhook-parser.ts` (Facebook feed comments use `value.from.{id,name}`; Instagram uses `value.from.{id,username}`).
- **Parsing verification**: `npm run verify:webhooks` runs `scripts/verify-webhook-parsing.ts` against the fixtures in `src/lib/__fixtures__/meta-webhooks.ts` (FB comment add / remove / brand self-reply, IG comment add / reply / ad comment) and exits non-zero on any mismatch. No test framework is required.
- **PII redaction verification**: `npm run verify:pii` exercises `redactPII()` (`src/lib/pii.ts`) — emails, UK/international phone numbers, @handles and URL query strings. Redaction is applied on the insights/clustering path only (bodies sent to `gpt-4o` for brief synthesis and bodies returned to the evidence drawer); the triage agent deliberately sees the full comment so it can draft a usable reply.
- **Webhook heartbeat**: every signed `POST /api/webhooks/meta` writes a `WebhookEventLog` row. `GET /api/health` and `/api/analytics` derive `webhookStatus` (`HEALTHY` ≤ 60 min / `IDLE` / `NO_TRAFFIC`) and `lastWebhookAt` from it. `processedAt` is stamped only on the direct-exec fallback path; queued (Inngest) batches leave it null.
- **Clustering**: `POST /api/insights/generate` backfills missing embeddings (≤ 50), loads the last 30 days of embedded high-intent comments, clusters them by cosine similarity over the stored pgvector vectors (adaptive threshold, min size 2, max 8 clusters), and passes the *grouped* clusters (redacted sample bodies + tag/category counts) to `gpt-4o`. Without `OPENAI_API_KEY`, a hashed bag-of-words fallback embedding plus template-based synthesis still yields real clusters. Each run replaces all previous briefs atomically.
- **Overrides**: manual priority/category/status changes in the inbox write `TriageOverride` rows (actor = verified user email); `aiOverrideRatePercent` = distinct overridden comments ÷ AI-triaged comments over 30 days.
- **Interactive Simulator**: Accessible via the **"Simulate Webhook"** button in the header or at `POST /api/webhooks/simulate`. Disabled in production unless `ENABLE_SIMULATOR=true`. It calls the ingestion pipeline directly (not the signed webhook route nor the queue — the synchronous result is part of its UX), targets the seeded accounts `ig_biz_9928374102` / `fb_page_1092837465`, and its destructive scenarios (`native_reply_sync`, `gdpr_deletion`) only ever touch comments whose `externalCommentId` starts with `sim_`.

---

## Background Queue (Inngest)

The webhook route does not process comments inline. It validates, parses and then `inngest.send()`s one `comment/ingested` event per comment (a single fast HTTP call, well inside Meta's 3-second SLA). The durable function `process-comment-event` (`src/lib/inngest/functions.ts`, 3 retries) runs the pipeline in `src/lib/workers/comment-pipeline.ts` and is served at `/api/inngest`.

### Local development

Run the Inngest dev server alongside `npm run dev`:

```bash
npx inngest-cli@latest dev -u http://localhost:3005/api/inngest
```

The dev UI is at [http://localhost:8288](http://localhost:8288) and shows every event, run, step and retry. Leave `INNGEST_EVENT_KEY=local` / `INNGEST_SIGNING_KEY=local` in `.env` for local mode.

**Fallback without the dev server:** if `INNGEST_EVENT_KEY` is unset or `local` and `inngest.send()` fails (no dev server listening), the webhook route logs a warning and runs `processCommentEvent()` directly, so demo/offline mode keeps working with zero extra infrastructure. The response body reports `dispatch: "queued"` or `dispatch: "direct"`. In production (a real event key) a send failure is logged as an error and the same direct fallback applies, so comments are never silently dropped.

### Production

Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from the Inngest dashboard and register the app URL (`https://<host>/api/inngest`). The endpoint is in `PUBLIC_PATHS`, so **it must have a Cloudflare Access Bypass policy** — it is self-verifying: every request from Inngest is signed with `INNGEST_SIGNING_KEY` and rejected otherwise.

---

## Reconciliation Cron (`/api/cron/reconcile`)

Instagram does not emit comment-deletion webhooks, so a comment deleted natively would otherwise persist here indefinitely (a GDPR gap). The reconciliation job walks every active account's non-brand comments from the last 30 days (Instagram first, then Facebook as a safety net for missed `remove` events) in batches of 50, asks Meta `GET /{comment-id}?fields=id` for each, and hard-deletes any that return HTTP 404 / Graph error code 100 (`GraphMethodException`). Cascades remove triage and replies, and deleted IDs are scrubbed from `ContentCluster.sampleCommentIds`. In mock/demo mode (no live token) nothing is ever deleted.

Returns `{ checked, deleted, clustersScrubbed, errors, mockMode, accounts, durationMs }`. Per run it checks at most 2,000 comments so a 15-minute schedule never overlaps itself.

### Auth

`GET` or `POST` with `Authorization: Bearer ${CRON_SECRET}`. Requests are rejected with `401` when `CRON_SECRET` is unset (or still the placeholder) or does not match; the comparison is constant-time. The path is under `/api/cron/` so the app middleware bypasses Access — **add a Cloudflare Access Bypass policy for `/api/cron/*`**, or alternatively keep Access enforced and call it with an Access **service token** (`CF-Access-Client-Id` / `CF-Access-Client-Secret` headers) *in addition to* the bearer secret.

### Schedule

Every 15 minutes is a sensible default (well within Graph API budgets for a few thousand recent comments). Example with cron:

```cron
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/reconcile
```

Or on Vercel, add to `vercel.json`: `{ "crons": [{ "path": "/api/cron/reconcile", "schedule": "*/15 * * * *" }] }` (Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when the env var is set).

Manual run:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3005/api/cron/reconcile
```
