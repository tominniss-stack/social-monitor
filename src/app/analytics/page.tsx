'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import {
  BarChart3,
  Clock,
  Zap,
  Percent,
  Smile,
  Meh,
  Frown,
  Loader2,
  Radio,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch } from '@/lib/api-client';

type WebhookStatus = 'HEALTHY' | 'IDLE' | 'NO_TRAFFIC';

interface AnalyticsStats {
  totalComments: number;
  answeredCount: number;
  needsAttentionCount: number;
  responseRatePercent: number;
  medianP1TtfrMinutes: number | null;
  medianP2TtfrMinutes: number | null;
  p1SampleSize: number;
  p2SampleSize: number;
  ingestionLatencySeconds: number | null;
  aiOverrideRatePercent: number;
  webhookStatus: WebhookStatus;
  lastWebhookAt: string | null;
  rateLimitBudgetUsedPercent: number;
  categoryBreakdown: Record<string, number>;
  sentimentBreakdown: Record<'POSITIVE' | 'NEUTRAL' | 'NEGATIVE', number>;
}

const fmtMinutes = (v: number | null) => (v === null ? '—' : `${v}m`);
const fmtSeconds = (v: number | null) => (v === null ? '—' : `${v}s`);

function ttfrStatus(v: number | null, targetMinutes: number) {
  if (v === null) return { label: 'No answered comments yet', tone: 'text-slate-400 dark:text-slate-500' };
  return v <= targetMinutes
    ? { label: 'Within SLA', tone: 'text-emerald-600 dark:text-emerald-400 font-semibold' }
    : { label: 'Outside SLA', tone: 'text-rose-600 dark:text-rose-400 font-semibold' };
}

const WEBHOOK_LABEL: Record<WebhookStatus, string> = {
  HEALTHY: 'Healthy',
  IDLE: 'Idle',
  NO_TRAFFIC: 'No traffic yet',
};

const WEBHOOK_TONE: Record<WebhookStatus, string> = {
  HEALTHY: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  IDLE: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  NO_TRAFFIC: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
};

function rateLimitTone(pct: number) {
  if (pct >= 90) return 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300';
  if (pct >= 70) return 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300';
  return 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const data = await apiFetch('/api/analytics');
        if (data.success) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs">Computing SLA metrics...</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
            <BarChart3 className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No data yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Analytics could not be loaded. Ingest some comments (or run the webhook simulator) and refresh.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const s = stats;
  const p1 = ttfrStatus(s.medianP1TtfrMinutes, 30);
  const p2 = ttfrStatus(s.medianP2TtfrMinutes, 60);
  const overrideWithinTarget = s.aiOverrideRatePercent < 15;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <BarChart3 className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              SLA Analytics & Engine Performance
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Time-to-First-Response (TTFR), ingestion latency, webhook health and LLM classification override rate — all computed from stored data
          </p>
        </div>

        {/* 4 Core KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: P1 TTFR */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Median TTFR (P1 Critical)
              </span>
              <Clock className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {fmtMinutes(s.medianP1TtfrMinutes)}
              </span>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                n={s.p1SampleSize}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              Target: &lt; 30 minutes &bull; <span className={p1.tone}>{p1.label}</span>
            </div>
          </div>

          {/* Card 2: P2 TTFR */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Median TTFR (P2 High)
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {fmtMinutes(s.medianP2TtfrMinutes)}
              </span>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                n={s.p2SampleSize}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              Target: &lt; 60 minutes &bull; <span className={p2.tone}>{p2.label}</span>
            </div>
          </div>

          {/* Card 3: Ingestion Latency */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Ingestion Latency
              </span>
              <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {fmtSeconds(s.ingestionLatencySeconds)}
              </span>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">median, 7 days</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              Published on Meta &rarr; stored in database
            </div>
          </div>

          {/* Card 4: AI Override Rate */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                AI Override Rate
              </span>
              <Percent className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {s.aiOverrideRatePercent}%
              </span>
              <span
                className={`text-xs font-medium ${
                  overrideWithinTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {overrideWithinTarget ? 'Within target' : 'Above target'}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              KPI Target: &lt; 15% manual priority/category overrides (30 days)
            </div>
          </div>
        </div>

        {/* Detailed Breakdowns Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Distribution */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Comments by Classified Category
              </h3>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Total: {s.totalComments}</span>
            </div>

            {s.totalComments === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 pt-2">No comments ingested yet.</p>
            ) : (
              <div className="space-y-3 pt-2">
                {Object.entries(s.categoryBreakdown).map(([cat, count]) => {
                  const total = s.totalComments || 1;
                  const percent = Math.round((count / total) * 100);
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{cat.replace('_', ' ')}</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {count} ({percent}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sentiment & Infrastructure Health */}
          <div className="space-y-6">
            {/* Sentiment Breakdown */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Audience Sentiment Distribution
              </h3>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 text-center">
                  <Smile className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1.5" />
                  <div className="text-xl font-bold text-emerald-900 dark:text-emerald-200">
                    {s.sentimentBreakdown.POSITIVE}
                  </div>
                  <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Positive</div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 text-center">
                  <Meh className="h-5 w-5 text-slate-600 dark:text-slate-400 mx-auto mb-1.5" />
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-200">
                    {s.sentimentBreakdown.NEUTRAL}
                  </div>
                  <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Neutral</div>
                </div>

                <div className="rounded-lg border border-rose-100 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 p-4 text-center">
                  <Frown className="h-5 w-5 text-rose-600 dark:text-rose-400 mx-auto mb-1.5" />
                  <div className="text-xl font-bold text-rose-900 dark:text-rose-200">
                    {s.sentimentBreakdown.NEGATIVE}
                  </div>
                  <div className="text-[11px] font-medium text-rose-700 dark:text-rose-300">Negative</div>
                </div>
              </div>
            </div>

            {/* Webhook Health */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Radio className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Meta Webhook Health
                </h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${WEBHOOK_TONE[s.webhookStatus]}`}
                >
                  {WEBHOOK_LABEL[s.webhookStatus]}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {s.lastWebhookAt
                  ? `Last signed webhook received ${formatDistanceToNow(new Date(s.lastWebhookAt), { addSuffix: true })}. Healthy means a delivery within the last 60 minutes.`
                  : 'No signed webhook POST has been recorded yet. The simulator calls the pipeline directly and does not count as webhook traffic.'}
              </p>
            </div>

            {/* Rate Limit Budgeting Status */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Meta Graph API Rate Limit Budget
                </h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${rateLimitTone(
                    s.rateLimitBudgetUsedPercent
                  )}`}
                >
                  {s.rateLimitBudgetUsedPercent}% Used
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {`Highest utilisation reported by Meta's x-app-usage and Business Use Case headers on the most recent Graph API call from this server instance. Reads 0% until a live call has been made.`}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
