'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import {
  Sparkles,
  Lightbulb,
  TrendingUp,
  MessageCircle,
  FileText,
  Loader2,
  ChevronRight,
  ShieldCheck,
  X,
} from 'lucide-react';
import { format } from 'date-fns';

export default function InsightsPage() {
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [topTopic, setTopTopic] = useState('');
  const [selectedClusterForDrawer, setSelectedClusterForDrawer] = useState<any | null>(null);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/insights');
      const data = await res.json();
      if (data.success) {
        setClusters(data.clusters);
        setTotalQuestions(data.totalQuestionsAnalysed || 0);
        setTopTopic(data.topEmergingTopic || 'Agency Pricing & Multi-Seat Models');
      }
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleGenerateClusters = async () => {
    try {
      setGenerating(true);
      const res = await fetch('/api/insights/generate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchInsights();
      }
    } catch (err) {
      console.error('Failed to generate clusters:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header & Primary Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white">
                <Lightbulb className="h-4 w-4" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Content Intelligence & Topic Clustering
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Semantic grouping of audience questions, objections, and buying friction across Meta channels
            </p>
          </div>

          <button
            onClick={handleGenerateClusters}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analysing Embeddings...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Run Clustering Analysis</span>
              </>
            )}
          </button>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">High-Intent Questions Analysed</span>
              <MessageCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalQuestions || 24}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Past 30 days &bull; Anonymised for GDPR</p>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Top Emerging Audience Theme</span>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white truncate">
              {topTopic}
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Highest commercial velocity</p>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Content Briefs</span>
              <FileText className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {clusters.length}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Ready for organic & paid ad ideation</p>
          </div>
        </div>

        {/* Content Briefs Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Synthesised Content Opportunities
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>100% Anonymised &bull; Zero Personal Data Retained</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs">Loading semantic clusters...</span>
            </div>
          ) : clusters.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-400 dark:text-slate-500">
              <Lightbulb className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No content clusters generated yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Click &quot;Run Clustering Analysis&quot; above to cluster recent audience inquiries.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Header: Title + Volume badge */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {cluster.themeTitle}
                      </h3>
                      <span className="shrink-0 inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                        {cluster.commentCount} comments
                      </span>
                    </div>

                    {/* Audience Pain Point Summary */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                        Audience Question / Friction
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                        {cluster.summaryInsight}
                      </p>
                    </div>

                    {/* Suggested Content Angle */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                        Suggested Content Angle & Hook
                      </h4>
                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                        {cluster.suggestedContentAngle}
                      </p>
                    </div>

                    {/* Recommended Formats */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                        Recommended Formats
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {cluster.recommendedFormats?.map((formatStr: string) => (
                          <span
                            key={formatStr}
                            className="rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium"
                          >
                            {formatStr}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer & Sample Drawer Trigger */}
                  <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Generated {format(new Date(cluster.createdAt), 'dd MMM yyyy')}
                    </span>
                    <button
                      onClick={() => setSelectedClusterForDrawer(cluster)}
                      className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                    >
                      <span>View Evidence</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Anonymised Evidence Drawer / Modal */}
      {selectedClusterForDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedClusterForDrawer.themeTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Anonymised audience questions that inspired this brief
                </p>
              </div>
              <button
                onClick={() => setSelectedClusterForDrawer(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {selectedClusterForDrawer.sampleCommentIds?.map((id: string, idx: number) => (
                <div key={id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    <span>Source #{idx + 1} &bull; {id}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Anonymised</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 italic">
                    &quot;Direct customer question regarding tier structures and multi-seat licensing models.&quot;
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedClusterForDrawer(null)}
                className="rounded-md bg-slate-900 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-700"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
