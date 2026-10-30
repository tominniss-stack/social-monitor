# Project Specification: Centralised Community & Content Intelligence Dashboard (v1 — Meta)

## 1. Agent Role & Directives (Antigravity Instructions)
You are the lead full-stack engineer building **v1 of the Centralised Community & Content Intelligence Dashboard**. 

Your objective is to build a production-ready internal web application that ingests Facebook Page and Instagram Business comments (both organic and paid/dark ad posts) in real time via Meta Graph API Webhooks, classifies them using an LLM with Structured Outputs, drafts human-in-the-loop replies, syncs bi-directional reply state, and clusters recurring customer questions into actionable content ideas.

### Architectural Rules & Constraints
1. **Platform-Agnostic Data Model:** Although Phase 1 only connects to Meta (`FACEBOOK` and `INSTAGRAM`), all database tables, UI components, and service interfaces MUST remain platform-agnostic so `LINKEDIN` and `TIKTOK` adapters can be added in Phase 2/3 without schema migrations.
2. **Webhook Speed (< 3 Seconds):** The `/api/webhooks/meta` POST route must verify the `X-Hub-Signature-256` cryptographic signature, enqueue the raw event into the background job processor, and immediately return HTTP `200 OK` within 3,000ms. Never run LLM calls or external Graph API fetches synchronously inside the webhook HTTP handler.
3. **Bi-Directional Native State Sync:** Community managers will occasionally reply natively via the Instagram or Facebook mobile apps. When a webhook event arrives where `author_external_id` matches our own Page/Account ID, automatically link the reply to the parent thread and update the parent comment's triage status to `ANSWERED`.
4. **GDPR Hard-Deletes:** When a webhook event arrives with `verb: "remove"`, immediately hard-delete the corresponding comment and triage record from PostgreSQL.
5. **UK English Conventions:** Use UK English spelling (`Prioritised`, `Categorised`, `Centralised`, `Analyse`) across all UI copy and user-facing labels.

---

## 2. Tech Stack & Dependencies
- **Framework:** Next.js 14+ (App Router, TypeScript, Server Actions + Route Handlers)
- **Styling & UI:** Tailwind CSS, `shadcn/ui` components, `lucide-react` icons
- **Database & ORM:** PostgreSQL with `pgvector` extension, managed via **Prisma ORM**
- **Async Queue / Background Jobs:** **Inngest** (serverless-friendly background queues/crons in Next.js) or **BullMQ + Redis** (provide local mock/fallback execution if Redis isn't running in dev)
- **AI / LLM SDK:** Vercel AI SDK (`ai` + `@ai-sdk/openai`) using `gpt-4o-mini` for classification/triage, `gpt-4o` for reply drafting & clustering synthesis, and `text-embedding-3-small` (`1536` dimensions) for embeddings
- **Validation:** `zod` for all API payloads, webhook schemas, and LLM structured outputs

---

## 3. Environment Variables (`.env.example`)
Create an `.env.example` file at the root of the project with the following variables:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/community_dashboard?schema=public"

# Meta Graph API (System User Token & App Credentials)
META_APP_ID="your_meta_app_id"
META_APP_SECRET="your_meta_app_secret"
META_WEBHOOK_VERIFY_TOKEN="your_custom_verify_token_string"
META_SYSTEM_USER_ACCESS_TOKEN="your_non_expiring_system_user_token"
META_GRAPH_API_VERSION="v21.0"

# OpenAI API
OPENAI_API_KEY="sk-..."

# App / Queue Config
NEXT_PUBLIC_APP_URL="http://localhost:3000"
INNGEST_EVENT_KEY="local"
INNGEST_SIGNING_KEY="local"
CRON_SECRET="your_cron_secret"
```

---

## 4. Database Schema (`prisma/schema.prisma`)
Initialize Prisma with the `postgresqlExtensions` preview feature enabled to support `pgvector`. Use the exact schema below:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

enum Platform {
  FACEBOOK
  INSTAGRAM
  LINKEDIN
  TIKTOK
}

enum TriageStatus {
  UNREAD
  NEEDS_REPLY
  DRAFT_READY
  ANSWERED
  IGNORED
  ESCALATED
}

enum PriorityLevel {
  P1_CRITICAL
  P2_HIGH
  P3_STANDARD
  P4_LOW
}

enum CommentCategory {
  LEAD_ENQUIRY
  PRODUCT_QUESTION
  COMPLAINT_SUPPORT
  PRAISE
  GENERAL_CHAT
  SPAM_TROLL
}

enum Sentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
}

model PlatformAccount {
  id                  String   @id @default(uuid())
  platform            Platform
  externalAccountId   String   @unique // Meta Page ID or IG Business Account ID
  name                String
  handle              String?
  avatarUrl           String?
  accessToken         String?  // Encrypted token or fallback to env System User token
  isActive            Boolean  @default(true)
  lastSyncedAt        DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  posts               Post[]

  @@index([platform, externalAccountId])
}

model Post {
  id                  String          @id @default(uuid())
  accountId           String
  account             PlatformAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  externalPostId      String          @unique // Graph API Post ID or IG Media ID
  effectiveStoryId    String?         // Used for dark/paid ad post resolution
  caption             String?         @db.Text
  permalink           String?
  mediaType           String?         // IMAGE, VIDEO, CAROUSEL_ALBUM, etc.
  mediaUrl            String?
  isPaidAd            Boolean         @default(false)
  publishedAt         DateTime
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  comments            Comment[]

  @@index([accountId, publishedAt])
}

model Comment {
  id                  String                      @id @default(uuid())
  postId              String
  post                Post                        @relation(fields: [postId], references: [id], onDelete: Cascade)
  parentCommentId     String?
  parentComment       Comment?                    @relation("CommentThread", fields: [parentCommentId], references: [id], onDelete: Cascade)
  replies             Comment[]                   @relation("CommentThread")
  
  externalCommentId   String                      @unique
  authorName          String
  authorUsername      String?
  authorExternalId    String?
  body                String                      @db.Text
  isFromBrand         Boolean                     @default(false)
  isHidden            Boolean                     @default(false)
  publishedAt         DateTime
  embedding           Unsupported("vector(1536)")?
  createdAt           DateTime                    @default(now())
  updatedAt           DateTime                    @updatedAt

  triage              CommentTriage?

  @@index([postId, publishedAt])
  @@index([parentCommentId])
}

model CommentTriage {
  commentId           String          @id
  comment             Comment         @relation(fields: [commentId], references: [id], onDelete: Cascade)
  status              TriageStatus    @default(UNREAD)
  priority            PriorityLevel   @default(P3_STANDARD)
  category            CommentCategory @default(GENERAL_CHAT)
  sentiment           Sentiment       @default(NEUTRAL)
  requiresHumanReply  Boolean         @default(true)
  aiReasoning         String?         @db.Text
  topicTags           String[]
  aiDraftReply        String?         @db.Text
  assignedTo          String?
  respondedAt         DateTime?
  respondedBy         String?
  updatedAt           DateTime        @updatedAt

  @@index([status, priority])
  @@index([category])
}

model ContentCluster {
  id                     String   @id @default(uuid())
  themeTitle             String
  summaryInsight         String   @db.Text
  suggestedContentAngle  String   @db.Text
  recommendedFormats     String[] // e.g., ["IG Carousel", "Reels FAQ", "FB Long-form"]
  commentCount           Int
  sampleCommentIds       String[]
  dateRangeStart         DateTime
  dateRangeEnd           DateTime
  createdAt              DateTime @default(now())
}

model BrandVoiceConfig {
  id                  String   @id @default("default")
  brandName           String   @default("Our Brand")
  toneGuidelines      String   @db.Text
  prohibitedPhrases   String[]
  signOffStyle        String?
  escalationRules     String   @db.Text
  updatedAt           DateTime @updatedAt
}
```

---

## 5. Backend Services & API Specifications

### 5.1 Meta Graph API Service (`src/lib/services/meta-graph.ts`)
Build a typed service wrapper handling Graph API `v21.0` calls with automatic rate-limit header inspection (`x-business-use-case-usage` and `x-app-usage`) and exponential backoff:
1. **`verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean`**
   - Computes HMAC-SHA256 using `META_APP_SECRET` and compares using `crypto.timingSafeEqual`.
2. **`fetchPostDetails(externalPostId: string, platform: Platform)`**
   - For Facebook: `GET /{post-id}?fields=id,message,created_time,permalink_url,is_eligible_for_promotion,promotion_status`
   - For Instagram: `GET /{media-id}?fields=id,caption,media_type,media_url,permalink,timestamp`
   - Also supports resolving dark/paid ad posts via `effective_object_story_id` when `ads_read` scope is present.
3. **`publishReply(externalCommentId: string, platform: Platform, message: string)`**
   - For Facebook: `POST /{comment-id}/comments` with `{ message }`
   - For Instagram: `POST /{ig-comment-id}/replies` with `{ message }`
4. **`setCommentVisibility(externalCommentId: string, platform: Platform, isHidden: boolean)`**
   - For Facebook: `POST /{comment-id}` with `{ is_hidden: isHidden }`
   - For Instagram: `POST /{ig-comment-id}` with `{ hide: isHidden }`
5. **`deleteExternalComment(externalCommentId: string)`**
   - `DELETE /{comment-id}`

### 5.2 Webhook Route (`src/app/api/webhooks/meta/route.ts`)
- **`GET` Handler:** Reads `hub.mode`, `hub.verify_token`, and `hub.challenge` from query params. If `hub.mode === 'subscribe'` and `hub.verify_token === process.env.META_WEBHOOK_VERIFY_TOKEN`, return plain text `hub.challenge` with status `200`. Otherwise return `403`.
- **`POST` Handler:**
  1. Read raw request body via `await req.text()`.
  2. Validate `x-hub-signature-256`. Return `401` if invalid.
  3. Parse payload (`object: 'page' | 'instagram'`, `entry[].changes[]`).
  4. Dispatch each comment change event to the background queue (`comment/ingested`).
  5. Return `NextResponse.json({ received: true }, { status: 200 })`.

### 5.3 Background Worker Pipeline (`src/lib/workers/comment-pipeline.ts`)
When `comment/ingested` runs:
1. **Handle Deletions (`verb === 'remove'`):**
   - Delete `Comment` where `externalCommentId` matches. Stop processing.
2. **Ensure Parent Post Exists:**
   - Check if `Post` exists in DB by `externalPostId`. If not, call `fetchPostDetails` from Meta Graph API (or use fallback mock metadata if running in offline/demo mode) and insert `Post`.
3. **Check for Brand Self-Reply (Native App Sync):**
   - Compare comment `authorExternalId` with `PlatformAccount.externalAccountId`.
   - If `isFromBrand === true`:
     - Upsert the reply `Comment` record with `isFromBrand: true`.
     - If `parentCommentId` is present, update the parent comment's `CommentTriage` record to `status: 'ANSWERED'`, `respondedAt: new Date()`, `respondedBy: 'Native App'`.
     - Stop processing (do not run LLM triage on our own replies).
4. **Upsert Customer Comment:**
   - Save the incoming comment in `Comment`.
5. **Execute LLM Classification & Reply Drafting (`src/lib/ai/triage-agent.ts`):**
   - Fetch the active `BrandVoiceConfig`, parent `Post.caption`, and any prior comments in the thread.
   - Call `generateObject` (Vercel AI SDK) with Zod schema:
     ```ts
     const TriageOutputSchema = z.object({
       priority: z.enum(['P1_CRITICAL', 'P2_HIGH', 'P3_STANDARD', 'P4_LOW']),
       category: z.enum([
         'LEAD_ENQUIRY',
         'PRODUCT_QUESTION',
         'COMPLAINT_SUPPORT',
         'PRAISE',
         'GENERAL_CHAT',
         'SPAM_TROLL',
       ]),
       sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
       requiresHumanReply: z.boolean(),
       reasoning: z.string(),
       extractedTopicTags: z.array(z.string()).max(5),
       draftReply: z.string().nullable(),
     });
     ```
   - Save result to `CommentTriage` with `status` set to `'DRAFT_READY'` (if `requiresHumanReply` is true) or `'IGNORED'` (if spam/low priority).
6. **Generate Vector Embedding (For High-Signal Comments):**
   - If `category` is `LEAD_ENQUIRY`, `PRODUCT_QUESTION`, or `COMPLAINT_SUPPORT`, generate an embedding of `Post Caption: ${caption}\nCustomer Comment: ${body}` using `text-embedding-3-small` and store it in `Comment.embedding` via raw SQL `UPDATE`.

### 5.4 Topic Clustering & Content Ideas Service (`src/lib/ai/clustering-agent.ts`)
- Expose `POST /api/insights/generate`:
  1. Queries all comments from the last 30 days categorized as `LEAD_ENQUIRY`, `PRODUCT_QUESTION`, or `COMPLAINT_SUPPORT` (stripping all author PII for GDPR compliance).
  2. Groups semantically similar comments using `pgvector` cosine distance (`<=>`) or k-means clustering over embeddings.
  3. Passes the grouped comment clusters to `gpt-4o` to synthesise 3 to 5 `ContentCluster` records containing:
     - `themeTitle`: Clear name of the recurring question/pain point.
     - `summaryInsight`: What the audience is confused about or asking for.
     - `suggestedContentAngle`: Specific hook and outline for a new social post addressing this theme.
     - `recommendedFormats`: Array of formats (e.g., `["IG Carousel", "Reels 60s Explainer"]`).

---

## 6. Frontend UI Architecture & User Experience

Build a fast, keyboard-accessible, modern SaaS dashboard interface with four core views:

### 6.1 Main Inbox View (`/inbox` — Three-Pane Layout)
1. **Left Pane — Smart Filters & Channels (240px fixed):**
   - **Channel Toggle:** All Platforms, Facebook Pages, Instagram Business (plus disabled "Coming Soon" badges for LinkedIn & TikTok).
   - **Post Type Filter:** All Posts, Organic Only, Paid Ads (Dark Posts).
   - **Triage Queues:**
     - `Needs Attention` (`UNREAD` + `NEEDS_REPLY` + `DRAFT_READY`, sorted by `P1_CRITICAL` $\rightarrow$ `P4_LOW`)
     - `High Intent Leads & Questions` (`LEAD_ENQUIRY` + `PRODUCT_QUESTION`)
     - `Complaints & Escalations` (`COMPLAINT_SUPPORT` + `ESCALATED`)
     - `Answered` (`ANSWERED`)
     - `Spam / Hidden` (`SPAM_TROLL` or `isHidden === true`)
2. **Centre Pane — Prioritised Comment Feed (380px–450px):**
   - Search bar + bulk action toolbar.
   - Each card displays:
     - Platform icon (FB / IG) + `PAID AD` badge if `post.isPaidAd === true`
     - Priority badge (`P1 Critical` in red, `P2 High` in amber, `P3 Standard` in blue, `P4 Low` in slate)
     - Category pill & Sentiment indicator
     - Author name, relative timestamp (`12m ago`), and comment snippet
     - Status indicator (`Draft Ready`, `Answered via Native App`, `Answered via Dashboard`)
3. **Right Pane — Thread & Context Inspector (Flex-1):**
   - **Parent Post Context Card (Collapsible):** Shows the original FB/IG post thumbnail, caption, published date, paid/organic badge, and external permalink so the community manager has full context.
   - **Conversation Thread:** Shows the top-level comment and any nested replies (clearly distinguishing customer comments from brand replies).
   - **AI Classification Breakdown:** Shows AI reasoning, extracted topic tags, and a one-click dropdown to manually override the Priority or Category (logging overrides to track the $<15\%$ override KPI).
   - **Human-in-the-Loop Reply Composer:**
     - Pre-populated with `aiDraftReply`.
     - Quick-tone buttons: *"Regenerate Shorter"*, *"More Empathetic"*, *"Include CTA/Link"*.
     - Primary Actions: **Approve & Post Reply**, **Mark Answered (No Reply Needed)**, **Hide Comment on Meta**, **Delete**.

### 6.2 Content Intelligence & Ideas View (`/insights`)
- Displays KPI summary cards (Total Questions Analysed, Top Emerging Topic, Content Briefs Generated).
- **"Run Clustering Analysis" Button:** Triggers `/api/insights/generate`.
- Grid of **Content Idea Cards** generated from `ContentCluster`, showing:
  - Theme Title & Volume badge (e.g., *"18 comments this month"*)
  - Audience Pain Point Summary
  - Suggested Content Brief & Hook
  - Expandable drawer showing the anonymised source comments that inspired the brief.

### 6.3 Analytics & SLA Performance View (`/analytics`)
- Tracks the v1 Success Criteria:
  - Median Time-to-First-Response (TTFR) broken down by Priority (`P1` vs `P2`).
  - Ingestion latency status & webhook health indicator.
  - AI Classification Override Rate percentage.
  - Breakdown of comments by Category and Sentiment.

### 6.4 Settings & Webhook Simulator View (`/settings`)
- **Brand Voice Configuration Form:** Edit `toneGuidelines`, `prohibitedPhrases`, and `escalationRules` stored in `BrandVoiceConfig`.
- **Connected Meta Accounts Status:** Shows configured Page/IG IDs and token validity.
- **Built-in Webhook Simulator (Crucial for Testing & Demo):**
  - Provide a UI button in `/settings` (and a header action) labeled **"Simulate Incoming Meta Webhook"**.
  - Clicking it allows testing realistic scenarios immediately without needing live Meta traffic:
    1. *Paid Ad Pricing Lead (IG)* $\rightarrow$ Classifies as `P1_CRITICAL` / `LEAD_ENQUIRY`.
    2. *Product Feature Question (FB)* $\rightarrow$ Classifies as `P2_HIGH` / `PRODUCT_QUESTION`.
    3. *Customer Support Complaint (IG)* $\rightarrow$ Classifies as `P1_CRITICAL` / `COMPLAINT_SUPPORT`.
    4. *Native App Brand Reply Sync* $\rightarrow$ Simulates an outbound reply posted from the IG mobile app and automatically marks an open thread as `ANSWERED`.
    5. *GDPR Comment Deletion (`verb: "remove"`)* $\rightarrow$ Removes the comment from the DB.

---

## 7. Step-by-Step Build Execution Plan for Antigravity

Execute the build in the following sequence:

### Phase 1: Project Scaffolding & Database Setup
1. Initialize the Next.js TypeScript project with Tailwind CSS and `shadcn/ui`.
2. Create `prisma/schema.prisma` and a seed script (`prisma/seed.ts`) that populates:
   - Default `BrandVoiceConfig`.
   - Two connected `PlatformAccount` records (1 Facebook Page, 1 Instagram Business account).
   - 4 sample `Post` records (2 organic, 2 paid dark posts).
   - 12 realistic `Comment` and `CommentTriage` records across all priorities (`P1`–`P4`), categories, and statuses (`DRAFT_READY`, `NEEDS_REPLY`, `ANSWERED`), plus 3 sample `ContentCluster` briefs so the UI is rich and interactive immediately upon boot.

### Phase 2: Core Services, AI Agents & Webhook Endpoints
1. Implement `src/lib/services/meta-graph.ts` (with graceful fallback to simulated responses when `META_SYSTEM_USER_ACCESS_TOKEN` is not yet configured in local dev).
2. Implement `src/lib/ai/triage-agent.ts` and `src/lib/ai/clustering-agent.ts` using the Vercel AI SDK and OpenAI (include deterministic fallback classification if `OPENAI_API_KEY` is omitted during initial preview).
3. Implement `/api/webhooks/meta/route.ts` (`GET` challenge verification + `POST` HMAC verification + async worker trigger).
4. Implement `/api/webhooks/simulate/route.ts` to power the interactive Webhook Simulator.

### Phase 3: Three-Pane Inbox, Insights & Settings UI
1. Build the global navigation shell and the three-pane `/inbox` interface with real-time filtering, priority badges, post context inspection, and reply publishing actions.
2. Build the `/insights` recurring topic clustering view and `/analytics` SLA dashboard.
3. Build the `/settings` view with Brand Voice prompt tuning and the interactive Webhook Simulator panel.
4. Run `npm run build` and verify zero TypeScript or linting errors.