'use client';

import React, { useState } from 'react';
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

export function Navbar() {
  const pathname = usePathname();
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();

  const navItems = [
    { href: '/', label: 'Prioritised Inbox', icon: Inbox },
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
            <Link href="/" className="flex items-center gap-2.5">
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
                const isActive = pathname === item.href;
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
            <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Meta Webhooks Active &bull; &lt; 3s SLA</span>
            </div>

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
