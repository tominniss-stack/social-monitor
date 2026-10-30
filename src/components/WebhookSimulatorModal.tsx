'use client';

import React, { useState } from 'react';
import {
  X,
  Zap,
  DollarSign,
  HelpCircle,
  AlertTriangle,
  Smartphone,
  Trash2,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEventSimulated: () => void;
}

export function WebhookSimulatorModal({ isOpen, onClose, onEventSimulated }: Props) {
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [customComment, setCustomComment] = useState('');

  if (!isOpen) return null;

  const scenarios = [
    {
      id: 'paid_ad_lead',
      title: '1. Paid Ad Pricing Lead (Instagram)',
      channel: 'Instagram Paid Ad',
      expected: 'P1_CRITICAL • LEAD_ENQUIRY',
      badgeColor: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900',
      icon: DollarSign,
      description: 'Simulates a prospective agency director asking for custom enterprise pricing on a dark sponsored video ad.',
      defaultBody: 'What is the pricing model for a team of 12 community managers? We manage 5 brands across the UK and need an enterprise quote ASAP.',
    },
    {
      id: 'product_question',
      title: '2. Product Feature Question (Facebook)',
      channel: 'Facebook Organic Feed',
      expected: 'P2_HIGH • PRODUCT_QUESTION',
      badgeColor: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900',
      icon: HelpCircle,
      description: 'Simulates a technical prospect asking whether dark ad posts and carousel albums are indexed in real time.',
      defaultBody: 'Does your webhook pipeline support real-time Instagram Carousel album mentions and dark post syncing directly into Slack?',
    },
    {
      id: 'support_complaint',
      title: '3. Urgent Customer Complaint (Instagram)',
      channel: 'Instagram Organic Post',
      expected: 'P1_CRITICAL • COMPLAINT_SUPPORT',
      badgeColor: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900',
      icon: AlertTriangle,
      description: 'Simulates an active subscriber reporting an outage and demanding immediate SLA escalation.',
      defaultBody: 'Our webhook ingestion dropped our ad comments for the last 3 hours and our team missed 4 urgent customer escalations! Fix this now.',
    },
    {
      id: 'native_reply_sync',
      title: '4. Native Mobile App Brand Reply Sync',
      channel: 'Instagram Mobile App (Native)',
      expected: 'Bi-Directional State Sync • ANSWERED',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
      icon: Smartphone,
      description: 'Simulates a community manager replying directly inside the native Instagram iPhone app. Detects brand author ID and flips the thread status to ANSWERED automatically.',
      defaultBody: 'Native outbound reply sent from Instagram mobile.',
    },
    {
      id: 'gdpr_deletion',
      title: '5. GDPR Comment Deletion (verb: "remove")',
      channel: 'Meta Webhook Deletion',
      expected: 'Immediate Hard Delete • Zero Retention',
      badgeColor: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      icon: Trash2,
      description: 'Simulates a user deleting their comment natively on Meta. Enforces immediate hard deletion from PostgreSQL for complete GDPR compliance.',
      defaultBody: 'Webhook verb: "remove"',
    },
  ];

  const handleSimulate = async (scenarioId: string) => {
    setLoadingScenario(scenarioId);
    setResult(null);

    try {
      const res = await fetch('/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: scenarioId,
          customComment: customComment.trim() || undefined,
        }),
      });

      const data = await res.json();
      setResult(data);
      onEventSimulated();
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoadingScenario(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-8 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Meta Webhook Event Simulator</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trigger realistic live events without needing external Meta traffic
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Custom comment input optional */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Custom Comment Text (Optional override for Scenarios 1–3)
            </label>
            <input
              type="text"
              placeholder="e.g. Can we integrate this with our custom ERP API? How much does enterprise cost?"
              value={customComment}
              onChange={(e) => setCustomComment(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Scenario Cards */}
          <div className="space-y-2.5">
            {scenarios.map((s) => {
              const Icon = s.icon;
              const isLoading = loadingScenario === s.id;
              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mt-0.5">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{s.title}</span>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${s.badgeColor}`}>
                          {s.expected}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{s.description}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSimulate(s.id)}
                    disabled={Boolean(loadingScenario)}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3" />
                        <span>Simulate Event</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Live Execution Feedback */}
          {result && (
            <div className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Webhook Dispatched & Ingested Successfully</span>
              </div>
              <div className="rounded border border-emerald-200/80 dark:border-emerald-900 bg-white dark:bg-slate-950 p-3 font-mono text-[11px] text-slate-800 dark:text-slate-200 max-h-48 overflow-y-auto">
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-6 py-3.5 bg-slate-50/50 dark:bg-slate-950/60">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Events mimic real Meta Graph API v21.0 webhook payloads with signature validation.
          </span>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
