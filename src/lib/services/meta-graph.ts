import crypto from 'crypto';
import { Platform } from '@prisma/client';
import { decryptSecret, isEncryptedSecret } from '@/lib/crypto';

/** Minimal shape needed to resolve a per-account token (full PlatformAccount rows satisfy it). */
export interface AccountTokenSource {
  id?: string;
  accessToken?: string | null;
}

export interface TokenValidity {
  valid: boolean;
  reason?: string;
}

/**
 * Resolves the Graph API token for an account (D-19): the AES-256-GCM
 * encrypted per-account token when set, else the env System User token.
 * Legacy plaintext values (pre-encryption rows) are honoured with a warning so
 * a rotation can be done gradually; new writes must use `encryptSecret()`.
 */
export function getAccountToken(account?: AccountTokenSource | null): string {
  const stored = account?.accessToken;
  if (stored) {
    if (isEncryptedSecret(stored)) return decryptSecret(stored);
    console.warn(
      `[MetaGraphService] PlatformAccount ${account?.id ?? '?'} has a plaintext accessToken; re-save it encrypted (TOKEN_ENCRYPTION_KEY).`
    );
    return stored;
  }
  return process.env.META_SYSTEM_USER_ACCESS_TOKEN || '';
}

export interface MetaPostDetails {
  id: string;
  caption?: string;
  permalink?: string;
  mediaType?: string;
  mediaUrl?: string;
  isPaidAd: boolean;
  effectiveStoryId?: string;
  publishedAt: Date;
}

export interface RateLimitStatus {
  /** `x-app-usage` percentages (0–100). */
  callCountPercent: number;
  totalTimePercent: number;
  totalCpuTimePercent: number;
  /** Highest utilisation across all BUC entries (0–100). */
  businessUseCasePercent: number;
  /** From BUC `estimated_time_to_regain_access` when throttled (minutes). */
  estimatedTimeToResetMinutes: number;
  /** Epoch ms until which outbound Graph calls are paused; 0 when not cooling down. */
  cooldownUntil: number;
  /** When headers were last parsed (epoch ms); 0 if never. */
  updatedAt: number;
}

/** Graph API error envelope: `{ error: { message, type, code, error_subcode, fbtrace_id } }`. */
export class MetaGraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly type?: string,
    public readonly subcode?: number
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

export class MetaRateLimitCooldownError extends Error {
  constructor(public readonly cooldownUntil: number) {
    super(
      `Meta Graph API calls paused until ${new Date(cooldownUntil).toISOString()} (rate-limit budget ≥ ${COOLDOWN_THRESHOLD_PERCENT}%).`
    );
    this.name = 'MetaRateLimitCooldownError';
  }
}

const COOLDOWN_THRESHOLD_PERCENT = 90;
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_SINGLE_WAIT_MS = 30_000;
/** Longest we'll block a caller waiting for a cooldown to expire before throwing. */
const MAX_COOLDOWN_WAIT_MS = 5_000;

const rateLimitStatus: RateLimitStatus = {
  callCountPercent: 0,
  totalTimePercent: 0,
  totalCpuTimePercent: 0,
  businessUseCasePercent: 0,
  estimatedTimeToResetMinutes: 0,
  cooldownUntil: 0,
  updatedAt: 0,
};

/** Snapshot of the module-level rate-limit state (Phase C analytics consumer). */
export function getRateLimitStatus(): RateLimitStatus {
  return { ...rateLimitStatus };
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

const pct = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

class MetaGraphService {
  private apiVersion: string;
  private appSecret: string;
  private systemToken: string;
  private baseUrl: string;

  constructor() {
    this.apiVersion = process.env.META_GRAPH_API_VERSION || 'v21.0';
    this.appSecret = process.env.META_APP_SECRET || '';
    this.systemToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || '';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /** True when no live Meta credentials are configured (demo/offline mode). */
  public isMockMode(): boolean {
    return !this.systemToken || this.systemToken.startsWith('mock_') || this.systemToken.startsWith('your_');
  }

  /**
   * Verifies the X-Hub-Signature-256 header sent by Meta Webhooks.
   * Fails closed: an unset META_APP_SECRET can never produce a valid signature.
   */
  public verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;

    if (!this.appSecret) {
      console.error('[MetaGraphService] META_APP_SECRET is not configured; rejecting webhook signature.');
      return false;
    }

    const expectedSignaturePrefix = 'sha256=';
    if (!signatureHeader.startsWith(expectedSignaturePrefix)) {
      return false;
    }

    const signatureHash = signatureHeader.substring(expectedSignaturePrefix.length);

    const hmac = crypto.createHmac('sha256', this.appSecret);
    hmac.update(rawBody, 'utf8');
    const computedHash = hmac.digest('hex');

    try {
      const signatureBuffer = Buffer.from(signatureHash, 'hex');
      const computedBuffer = Buffer.from(computedHash, 'hex');

      if (signatureBuffer.length !== computedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Transport: retry, backoff, rate-limit accounting
  // ---------------------------------------------------------------------------

  /**
   * Retry wrapper with rate-limit awareness:
   *  - refuses (or briefly waits) while a usage-triggered cooldown is active;
   *  - honours `Retry-After` on 429/503, else exponential backoff;
   *  - single waits are capped at 30s.
   */
  private async requestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {},
    retries = 3,
    delayMs = 600,
    account?: AccountTokenSource | null
  ): Promise<T> {
    if (this.isMockMode()) {
      // In dev/demo mode without live Meta credentials, gracefully return simulated payload
      return this.mockEndpointResponse<T>(endpoint, options);
    }

    await this.awaitCooldownOrThrow();

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Authorization')) {
      // Per-account token (decrypted at call time) when present, else the System User token.
      headers.set('Authorization', `Bearer ${getAccountToken(account) || this.systemToken}`);
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });

        this.parseRateLimitHeaders(
          response.headers.get('x-business-use-case-usage'),
          response.headers.get('x-app-usage')
        );

        if (response.status === 429 || response.status === 503) {
          const waitTime = this.retryAfterMs(response.headers.get('retry-after')) ?? this.backoffMs(delayMs, attempt);
          console.warn(
            `[MetaGraphService] ${response.status} from Graph API (attempt ${attempt}/${retries}); waiting ${waitTime}ms.`
          );
          if (attempt === retries) {
            throw new MetaGraphError(`Meta API throttled (${response.status}) after ${retries} attempts.`, response.status);
          }
          await sleep(waitTime);
          continue;
        }

        if (!response.ok) {
          throw await this.toGraphError(response);
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err;
        // Client-side Graph errors (4xx other than 429) are not transient — don't retry.
        if (err instanceof MetaGraphError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
        if (attempt === retries) throw err;
        await sleep(this.backoffMs(delayMs, attempt));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Meta API request failed after ${retries} attempts.`);
  }

  private backoffMs(delayMs: number, attempt: number): number {
    return Math.min(delayMs * Math.pow(2, attempt), MAX_SINGLE_WAIT_MS);
  }

  /** Parses `Retry-After` (seconds or HTTP-date) into ms, capped at 30s. */
  private retryAfterMs(header: string | null): number | null {
    if (!header) return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_SINGLE_WAIT_MS);
    }
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(date - Date.now(), 0), MAX_SINGLE_WAIT_MS);
    }
    return null;
  }

  private async awaitCooldownOrThrow(): Promise<void> {
    const remaining = rateLimitStatus.cooldownUntil - Date.now();
    if (remaining <= 0) return;
    if (remaining <= MAX_COOLDOWN_WAIT_MS) {
      console.warn(`[MetaGraphService] Rate-limit cooldown active; waiting ${remaining}ms before calling Graph API.`);
      await sleep(remaining);
      return;
    }
    throw new MetaRateLimitCooldownError(rateLimitStatus.cooldownUntil);
  }

  private async toGraphError(response: Response): Promise<MetaGraphError> {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };
      const e = body.error;
      if (e) {
        return new MetaGraphError(
          `Meta API error (${response.status}): ${e.message ?? text}`,
          response.status,
          e.code,
          e.type,
          e.error_subcode
        );
      }
    } catch {
      // non-JSON body
    }
    return new MetaGraphError(`Meta API error (${response.status}): ${text}`, response.status);
  }

  /**
   * Records `x-app-usage` ({ call_count, total_time, total_cputime }) and
   * `x-business-use-case-usage` ({ [businessId]: [{ type, call_count, total_cputime,
   * total_time, estimated_time_to_regain_access }] }) into the module-level status
   * and arms a cooldown when any metric reaches the threshold.
   */
  private parseRateLimitHeaders(bucHeader: string | null, appUsageHeader: string | null): void {
    if (!bucHeader && !appUsageHeader) return;

    let maxPercent = 0;
    let resetMinutes = 0;

    if (appUsageHeader) {
      try {
        const usage = JSON.parse(appUsageHeader) as Record<string, unknown>;
        rateLimitStatus.callCountPercent = pct(usage.call_count);
        rateLimitStatus.totalTimePercent = pct(usage.total_time);
        rateLimitStatus.totalCpuTimePercent = pct(usage.total_cputime);
        maxPercent = Math.max(
          maxPercent,
          rateLimitStatus.callCountPercent,
          rateLimitStatus.totalTimePercent,
          rateLimitStatus.totalCpuTimePercent
        );
      } catch {
        // malformed header — ignore
      }
    }

    if (bucHeader) {
      try {
        const parsed = JSON.parse(bucHeader) as Record<string, Array<Record<string, unknown>>>;
        let bucMax = 0;
        for (const businessId of Object.keys(parsed)) {
          const list = Array.isArray(parsed[businessId]) ? parsed[businessId] : [];
          for (const item of list) {
            const itemMax = Math.max(pct(item.call_count), pct(item.total_time), pct(item.total_cputime));
            bucMax = Math.max(bucMax, itemMax);
            const regain = Number(item.estimated_time_to_regain_access);
            if (Number.isFinite(regain) && regain > 0) resetMinutes = Math.max(resetMinutes, regain);
            if (itemMax >= 75) {
              console.warn(`[Meta RateLimit] Business ${businessId} (${String(item.type)}) at ${itemMax}% BUC quota.`);
            }
          }
        }
        rateLimitStatus.businessUseCasePercent = bucMax;
        maxPercent = Math.max(maxPercent, bucMax);
      } catch {
        // malformed header — ignore
      }
    }

    rateLimitStatus.estimatedTimeToResetMinutes = resetMinutes;
    rateLimitStatus.updatedAt = Date.now();

    if (maxPercent >= COOLDOWN_THRESHOLD_PERCENT) {
      const cooldownMs = resetMinutes > 0 ? resetMinutes * 60_000 : DEFAULT_COOLDOWN_MS;
      rateLimitStatus.cooldownUntil = Math.max(rateLimitStatus.cooldownUntil, Date.now() + cooldownMs);
      console.warn(
        `[Meta RateLimit] Usage at ${maxPercent}% — pausing Graph API calls for ${Math.round(cooldownMs / 1000)}s.`
      );
    } else if (rateLimitStatus.cooldownUntil && maxPercent < COOLDOWN_THRESHOLD_PERCENT - 10) {
      // Budget recovered; clear any residual cooldown early.
      rateLimitStatus.cooldownUntil = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Token validity (D-19)
  // ---------------------------------------------------------------------------

  /**
   * Real token check for the Settings page: `GET /me?fields=id` with the
   * System User token (or the account's own token when one is stored).
   * Never throws — returns `{ valid:false, reason }` on any failure.
   */
  public async checkTokenValidity(account?: AccountTokenSource | null): Promise<TokenValidity> {
    if (this.isMockMode() && !account?.accessToken) {
      return { valid: false, reason: 'demo mode (no token configured)' };
    }

    try {
      const me = await this.requestWithRetry<{ id?: string }>('/me?fields=id', {}, 1, 300, account);
      if (me && typeof me.id === 'string' && me.id.length > 0) {
        return { valid: true };
      }
      return { valid: false, reason: 'Graph API returned no identity for this token' };
    } catch (err) {
      if (err instanceof MetaGraphError) {
        // OAuthException code 190 = invalid/expired token; 10/200-299 = permission errors.
        const detail = err.code ? ` (code ${err.code}${err.subcode ? `/${err.subcode}` : ''})` : '';
        return { valid: false, reason: `${err.type ?? 'Graph error'}${detail}: ${err.message}` };
      }
      if (err instanceof MetaRateLimitCooldownError) {
        return { valid: false, reason: 'rate-limit cooldown active; retry shortly' };
      }
      return { valid: false, reason: err instanceof Error ? err.message : 'token check failed' };
    }
  }

  // ---------------------------------------------------------------------------
  // Posts
  // ---------------------------------------------------------------------------

  /**
   * Fetches parent post details (organic or paid dark ad).
   *
   * Facebook dark-post resolution: comments on ad creatives arrive with an
   * `ad_id_post_id`-style object that isn't a readable Page post. If the initial
   * post fetch fails, we ask for `effective_object_story_id` (requires
   * `ads_read`) and re-fetch the underlying story once, flagging it as paid.
   */
  public async fetchPostDetails(externalPostId: string, platform: Platform): Promise<MetaPostDetails> {
    const isFacebook = platform === Platform.FACEBOOK;

    if (this.isMockMode()) {
      return this.mockPostDetails(externalPostId, platform);
    }

    try {
      return isFacebook
        ? await this.fetchFacebookPost(externalPostId, { resolveDarkPost: true })
        : await this.fetchInstagramMedia(externalPostId);
    } catch (err) {
      console.warn(`[MetaGraphService] fetchPostDetails(${externalPostId}) failed; using placeholder metadata.`, err);
      // Live mode placeholder: never guess paid status from the ID shape.
      return {
        id: externalPostId,
        caption: '',
        permalink: undefined,
        mediaType: 'UNKNOWN',
        mediaUrl: undefined,
        isPaidAd: false,
        publishedAt: new Date(),
      };
    }
  }

  private async fetchFacebookPost(
    postId: string,
    opts: { resolveDarkPost: boolean; effectiveStoryId?: string; isPaidAd?: boolean }
  ): Promise<MetaPostDetails> {
    const fields = 'id,message,created_time,permalink_url,from,status_type,promotion_status';

    try {
      const data = await this.requestWithRetry<Record<string, unknown>>(`/${postId}?fields=${fields}`);
      return {
        id: postId,
        caption: typeof data.message === 'string' ? data.message : '',
        permalink: typeof data.permalink_url === 'string' ? data.permalink_url : undefined,
        mediaType: typeof data.status_type === 'string' ? data.status_type.toUpperCase() : data.message ? 'TEXT' : 'IMAGE',
        mediaUrl: undefined,
        // Primary signals: explicit resolution via effective_object_story_id (below)
        // or the event's own isPaidAd. promotion_status is a secondary (boosted-post) hint.
        isPaidAd: Boolean(opts.isPaidAd) || data.promotion_status === 'active',
        effectiveStoryId: opts.effectiveStoryId,
        publishedAt: typeof data.created_time === 'string' ? new Date(data.created_time) : new Date(),
      };
    } catch (err) {
      if (!opts.resolveDarkPost) throw err;

      // Try dark-post resolution: ad objects expose effective_object_story_id.
      const resolved = await this.requestWithRetry<{ effective_object_story_id?: string }>(
        `/${postId}?fields=effective_object_story_id`
      );
      const storyId = resolved.effective_object_story_id;
      if (!storyId || storyId === postId) throw err;

      console.log(`[MetaGraphService] Resolved dark post ${postId} → story ${storyId}.`);
      const story = await this.fetchFacebookPost(storyId, {
        resolveDarkPost: false,
        effectiveStoryId: storyId,
        isPaidAd: true,
      });
      // Keep the original external ID as the key so the Post row matches the webhook.
      return { ...story, id: postId, isPaidAd: true, effectiveStoryId: storyId };
    }
  }

  private async fetchInstagramMedia(mediaId: string): Promise<MetaPostDetails> {
    const fields = 'id,caption,media_type,media_url,permalink,timestamp';
    const data = await this.requestWithRetry<Record<string, unknown>>(`/${mediaId}?fields=${fields}`);
    return {
      id: mediaId,
      caption: typeof data.caption === 'string' ? data.caption : '',
      permalink: typeof data.permalink === 'string' ? data.permalink : undefined,
      mediaType: typeof data.media_type === 'string' ? data.media_type : 'IMAGE',
      mediaUrl: typeof data.media_url === 'string' ? data.media_url : undefined,
      // IG ad comments are flagged on the event itself (media.ad_id); never inferred here.
      isPaidAd: false,
      publishedAt: typeof data.timestamp === 'string' ? new Date(data.timestamp) : new Date(),
    };
  }

  /**
   * DEMO-ONLY post metadata. Simulated IDs (e.g. `ig_ad_88302`, `fb_ad_…`)
   * legitimately encode paid status in their name; real Meta IDs are numeric,
   * so this heuristic must never be applied in live mode.
   */
  private mockPostDetails(externalPostId: string, platform: Platform): MetaPostDetails {
    const isFacebook = platform === Platform.FACEBOOK;
    const looksLikeSimulatedAd = /(^|_)ad(_|$)/i.test(externalPostId); // demo-only heuristic
    return {
      id: externalPostId,
      caption: `Simulated post context for ${platform} ${externalPostId}. Discussion on social intelligence workflows.`,
      permalink: `https://${isFacebook ? 'facebook.com' : 'instagram.com'}/p/${externalPostId}`,
      mediaType: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80',
      isPaidAd: looksLikeSimulatedAd,
      effectiveStoryId: looksLikeSimulatedAd ? `${externalPostId}_story` : undefined,
      publishedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------

  /**
   * Returns false when Meta reports the comment no longer exists
   * (HTTP 404, or Graph error code 100 / GraphMethodException — "Unsupported get
   * request / object does not exist"). Any other failure is re-thrown so the
   * reconciliation job never deletes on transient errors. Always true in mock mode.
   */
  public async checkCommentExists(externalCommentId: string): Promise<boolean> {
    if (this.isMockMode()) return true;

    try {
      await this.requestWithRetry<{ id: string }>(`/${externalCommentId}?fields=id`);
      return true;
    } catch (err) {
      if (err instanceof MetaGraphError) {
        if (err.status === 404 || err.code === 100 || err.type === 'GraphMethodException') {
          return false;
        }
      }
      throw err;
    }
  }

  /**
   * Publishes a reply to an external FB/IG comment.
   */
  public async publishReply(
    externalCommentId: string,
    platform: Platform,
    message: string,
    account?: AccountTokenSource | null
  ): Promise<{ success: boolean; externalReplyId: string }> {
    const isFacebook = platform === Platform.FACEBOOK;
    const endpoint = isFacebook ? `/${externalCommentId}/comments` : `/${externalCommentId}/replies`;

    const result = await this.requestWithRetry<{ id?: string }>(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
      3,
      600,
      account
    );

    return {
      success: true,
      externalReplyId: result.id || `reply_${Date.now()}`,
    };
  }

  /**
   * Hides or unhides a comment natively on Facebook or Instagram.
   */
  public async setCommentVisibility(
    externalCommentId: string,
    platform: Platform,
    isHidden: boolean,
    account?: AccountTokenSource | null
  ): Promise<{ success: boolean }> {
    const isFacebook = platform === Platform.FACEBOOK;
    const endpoint = `/${externalCommentId}`;
    const body = isFacebook ? { is_hidden: isHidden } : { hide: isHidden };

    await this.requestWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      3,
      600,
      account
    );

    return { success: true };
  }

  /**
   * Deletes a comment natively on Meta.
   */
  public async deleteExternalComment(
    externalCommentId: string,
    account?: AccountTokenSource | null
  ): Promise<{ success: boolean }> {
    await this.requestWithRetry(`/${externalCommentId}`, { method: 'DELETE' }, 3, 600, account);

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Demo mode
  // ---------------------------------------------------------------------------

  /**
   * Mock responses for local dev / preview environments (no live token).
   */
  private mockEndpointResponse<T>(endpoint: string, options: RequestInit): T {
    if (options.method === 'POST') {
      return { id: `mock_reply_${Date.now()}`, success: true } as unknown as T;
    }
    if (options.method === 'DELETE') {
      return { success: true } as unknown as T;
    }
    const id = endpoint.replace('/', '').split('?')[0];
    return {
      id,
      caption: 'Enterprise AI Community & Content Intelligence platform announcement.',
      permalink_url: 'https://instagram.com/p/mock_preview',
      created_time: new Date().toISOString(),
      // demo-only heuristic: simulated ad IDs contain "ad"
      promotion_status: /(^|_)ad(_|$)/i.test(id) ? 'active' : 'inactive',
    } as unknown as T;
  }
}

export const metaGraph = new MetaGraphService();
