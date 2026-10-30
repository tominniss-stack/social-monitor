'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Inbox,
  Lightbulb,
  BarChart3,
  Settings,
  Sparkles,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';
import { WebhookSimulatorModal } from './WebhookSimulatorModal';
import { useTheme } from './ThemeProvider';
import { apiFetch } from '@/lib/api-client';

type WebhookStatus = 'HEALTHY' | 'IDLE' | 'NO_TRAFFIC';

const HEALTH_PILL: Record<
  WebhookStatus,
  { label: string; wrapper: string; dot: string; ping: boolean }
> = {
  HEALTHY: {
    label: 'Meta Webhooks Healthy',
    wrapper:
      'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    ping: true,
  },
  IDLE: {
    label: 'Meta Webhooks Idle',
    wrapper:
      'border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
    dot: 'bg-amber-500',
    ping: false,
  },
  NO_TRAFFIC: {
    label: 'Awaiting Webhooks',
    wrapper:
      'border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400',
    ping: false,
  },
};

const HEALTH_POLL_MS = 60_000;

export function Navbar() {
  const pathname = usePathname();
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [lastWebhookAt, setLastWebhookAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch('/api/health');
        if (!cancelled && data?.success) {
          setWebhookStatus(data.webhookStatus);
          setLastWebhookAt(data.lastWebhookAt ?? null);
        }
      } catch {
        // Pill simply stays in its last known state.
      }
    };
    load();
    const timer = setInterval(load, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const pill = webhookStatus ? HEALTH_PILL[webhookStatus] : null;

  const navItems = [
    { href: '/inbox', label: 'Prioritised Inbox', icon: Inbox },
    { href: '/insights', label: 'Content Ideas', icon: Lightbulb },
    { href: '/analytics', label: 'SLA Analytics', icon: BarChart3 },
    { href: '/settings', label: 'Settings & Simulator', icon: Settings },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur transition-colors">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/inbox" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                  Aether Intelligence
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium -mt-0.5">
                  Meta Community & Content Engine (v1)
                </span>
              </div>
            </Link>

            {/* Nav Tabs */}
            <nav className="hidden md:flex items-center gap-1 pl-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                // `/` redirects to `/inbox`, so treat both as the inbox tab.
                const isActive =
                  pathname === item.href || (item.href === '/inbox' && (pathname === '/' || pathname.startsWith('/inbox')));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Actions, Health Pill & Dark Mode Toggle */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {pill && (
              <div
                className={`hidden lg:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${pill.wrapper}`}
                title={
                  lastWebhookAt
                    ? `Last signed webhook: ${new Date(lastWebhookAt).toLocaleString('en-GB')}`
                    : 'No signed webhook received yet'
                }
              >
                <span className="relative flex h-2 w-2">
                  {pill.ping && (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pill.dot}`}></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${pill.dot}`}></span>
                </span>
                <span>{pill.label}</span>
              </div>
            )}

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
            </button>

            {/* Simulate Webhook Trigger */}
            <button
              onClick={() => setSimulatorOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/60 transition-colors shadow-xs"
            >
              <Zap className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Simulate Webhook</span>
            </button>
          </div>
        </div>
      </header>

      {/* Simulator Modal */}
      <WebhookSimulatorModal
        isOpen={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        onEventSimulated={() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('social_monitor_refresh'));
          }
        }}
      />
    </>
  );
}
