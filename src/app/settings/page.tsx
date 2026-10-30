'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import {
  Settings,
  Shield,
  Smartphone,
  Save,
  CheckCircle2,
  Zap,
  DollarSign,
  HelpCircle,
  AlertTriangle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form State
  const [brandName, setBrandName] = useState('Aether AI');
  const [toneGuidelines, setToneGuidelines] = useState('');
  const [prohibitedPhrases, setProhibitedPhrases] = useState('');
  const [signOffStyle, setSignOffStyle] = useState('');
  const [escalationRules, setEscalationRules] = useState('');

  // Meta accounts
  const [accounts, setAccounts] = useState<any[]>([]);
  const [metaConfig, setMetaConfig] = useState<any>(null);
  // Real token validity (D-19): { valid, reason? } from GET /me?fields=id, or demo-mode reason.
  const [tokenStatus, setTokenStatus] = useState<{ valid: boolean; reason?: string } | null>(null);

  // Simulation inline state
  const [simLoading, setSimLoading] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<any | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const data = await apiFetch('/api/settings');
        if (data.success) {
          if (data.brandVoice) {
            setBrandName(data.brandVoice.brandName || 'Aether AI');
            setToneGuidelines(data.brandVoice.toneGuidelines || '');
            setProhibitedPhrases(
              Array.isArray(data.brandVoice.prohibitedPhrases)
                ? data.brandVoice.prohibitedPhrases.join(', ')
                : ''
            );
            setSignOffStyle(data.brandVoice.signOffStyle || '');
            setEscalationRules(data.brandVoice.escalationRules || '');
          }
          setAccounts(data.accounts || []);
          setMetaConfig(data.metaConfig || null);
          setTokenStatus(data.tokenStatus || null);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSaveBrandVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      const data = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName,
          toneGuidelines,
          prohibitedPhrases,
          signOffStyle,
          escalationRules,
        }),
      });
      if (data.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 4000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRunSimulator = async (scenario: string) => {
    setSimLoading(scenario);
    setSimResult(null);
    try {
      const data = await apiFetch('/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      setSimResult(data);
    } catch (err: any) {
      setSimResult({ error: err.message });
    } finally {
      setSimLoading(null);
    }
  };

  // Token pill: green = live token verified, amber = demo mode (no token), red = invalid + reason.
  const isDemoToken = tokenStatus !== null && !tokenStatus.valid && (tokenStatus.reason || '').startsWith('demo mode');
  const tokenDot =
    tokenStatus === null
      ? 'bg-slate-300 dark:bg-slate-600'
      : tokenStatus.valid
        ? 'bg-emerald-500'
        : isDemoToken
          ? 'bg-amber-500'
          : 'bg-rose-500';
  const tokenLabel =
    tokenStatus === null
      ? 'Checking token…'
      : tokenStatus.valid
        ? 'Token Verified'
        : isDemoToken
          ? 'Demo Mode (no token)'
          : 'Token Invalid';
  const tokenLabelClass =
    tokenStatus === null
      ? 'text-slate-400 dark:text-slate-500'
      : tokenStatus.valid
        ? 'text-emerald-600 dark:text-emerald-400'
        : isDemoToken
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-rose-600 dark:text-rose-400';

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs">Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Settings className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              System Settings & Webhook Simulator
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage LLM brand tone rules, inspect connected Meta Business credentials, and trigger test webhooks
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT 2 COLUMNS: Brand Voice Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Brand Voice & Tone Guidelines
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Governs prompt steering for all AI classification and reply draft generation
                  </p>
                </div>
                {savedSuccess && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Saved Successfully</span>
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveBrandVoice} className="space-y-4">
                {/* Brand Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    required
                  />
                </div>

                {/* Tone Guidelines */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tone & Voice Instructions (UK English)
                  </label>
                  <textarea
                    rows={4}
                    value={toneGuidelines}
                    onChange={(e) => setToneGuidelines(e.target.value)}
                    placeholder="e.g. Professional yet conversational, authoritative, empathetic. Always use UK English spelling."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-xs text-slate-800 dark:text-slate-100 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 font-sans leading-relaxed"
                  />
                </div>

                {/* Prohibited Phrases */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Prohibited Phrases (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={prohibitedPhrases}
                    onChange={(e) => setProhibitedPhrases(e.target.value)}
                    placeholder="guaranteed 10X ROI, competitor sucks, no refunds"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    The LLM will strictly refuse to include these phrases in any customer-facing draft.
                  </p>
                </div>

                {/* Sign-off Style */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sign-Off Style
                  </label>
                  <input
                    type="text"
                    value={signOffStyle}
                    onChange={(e) => setSignOffStyle(e.target.value)}
                    placeholder="e.g. Best regards, the Aether Community Team"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                </div>

                {/* Escalation Rules */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Critical Escalation Rules
                  </label>
                  <textarea
                    rows={3}
                    value={escalationRules}
                    onChange={(e) => setEscalationRules(e.target.value)}
                    placeholder="e.g. Escalate immediately on mention of legal action, data breach, or billing overcharge >£500."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-xs text-slate-800 dark:text-slate-100 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 font-sans leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>Save Brand Voice</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Interactive Webhook Simulator Inline Panel */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Interactive Webhook Testing Suite
                  </h3>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">POST /api/webhooks/simulate</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'paid_ad_lead',
                    title: 'Paid Ad Pricing Lead',
                    sub: 'IG Sponsored Video -> P1 / Lead Enquiry',
                    icon: DollarSign,
                  },
                  {
                    id: 'product_question',
                    title: 'Product Feature Question',
                    sub: 'FB Organic Feed -> P2 / Product Question',
                    icon: HelpCircle,
                  },
                  {
                    id: 'support_complaint',
                    title: 'Customer Service Outage',
                    sub: 'IG Feed -> P1 / Complaint Support',
                    icon: AlertTriangle,
                  },
                  {
                    id: 'native_reply_sync',
                    title: 'Native Mobile Brand Reply',
                    sub: 'Instagram App -> Flip to ANSWERED',
                    icon: Smartphone,
                  },
                  {
                    id: 'gdpr_deletion',
                    title: 'GDPR Comment Removal',
                    sub: 'verb: "remove" -> Hard Delete from DB',
                    icon: Trash2,
                  },
                ].map((s) => {
                  const Icon = s.icon;
                  const isRunning = simLoading === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleRunSimulator(s.id)}
                      disabled={Boolean(simLoading)}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors disabled:opacity-50"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mt-0.5">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                          <span>{s.title}</span>
                          {isRunning && <Loader2 className="h-3 w-3 animate-spin text-indigo-600 dark:text-indigo-400" />}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{s.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {simResult && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Simulator Execution Output:</span>
                  </div>
                  <pre className="rounded bg-white dark:bg-slate-950 p-2.5 font-mono text-[10px] text-slate-800 dark:text-slate-200 border border-emerald-200/80 dark:border-emerald-900 max-h-36 overflow-y-auto">
                    {JSON.stringify(simResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Meta Accounts & API Auth */}
          <div className="space-y-6">
            {/* Connected Platform Accounts */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Connected Meta Accounts
              </h3>

              <div className="space-y-3">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 bg-slate-50/50 dark:bg-slate-950/60"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${
                            acc.platform === 'FACEBOOK' ? 'bg-blue-600' : 'bg-pink-600'
                          }`}
                        >
                          {acc.platform}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{acc.name}</span>
                      </div>
                      <span className={`flex h-2 w-2 rounded-full ${tokenDot}`} title={tokenLabel} />
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 font-mono">
                      <div>Handle: {acc.handle || 'N/A'}</div>
                      <div>External ID: {acc.externalAccountId}</div>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200/60 dark:border-slate-800">
                      <span>Status: {acc.isActive ? 'Active' : 'Inactive'}</span>
                      <span className={`font-semibold ${tokenLabelClass}`}>{tokenLabel}</span>
                    </div>
                    {tokenStatus && !tokenStatus.valid && !isDemoToken && tokenStatus.reason && (
                      <div className="text-[10px] text-rose-600 dark:text-rose-400 break-words">{tokenStatus.reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Authentication Architecture Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Authentication & Security
                </h3>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong>Non-Expiring System User Token:</strong> Eliminates 60-day OAuth token expirations by using an internal Meta Business Manager System User token.
                </p>
                <p>
                  <strong>HMAC-SHA256 Verification:</strong> All incoming webhooks are cryptographically authenticated using your Meta App Secret.
                </p>
                <p>
                  <strong>GDPR Compliance:</strong> Native comment removals instantly purge personal data from PostgreSQL.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1 font-mono">
                <div>Graph API: {metaConfig?.apiVersion || 'v21.0'}</div>
                <div>App Secret: SHA-256 Enabled</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
