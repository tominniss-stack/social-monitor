'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Inbox,
  Search,
  Sparkles,
  Send,
  EyeOff,
  Eye,
  Trash2,
  ExternalLink,
  CheckCircle,
  Clock,
  Flame,
  ChevronDown,
  ChevronUp,
  Tag,
  ShieldAlert,
  Loader2,
  User,
  Bot,
  CheckCheck,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type PlatformFilter = 'ALL' | 'FACEBOOK' | 'INSTAGRAM';
type PostTypeFilter = 'ALL' | 'ORGANIC' | 'PAID';
type QueueFilter = 'NEEDS_ATTENTION' | 'HIGH_INTENT' | 'COMPLAINTS' | 'ANSWERED' | 'SPAM';

export function InboxView() {
  const [platform, setPlatform] = useState<PlatformFilter>('ALL');
  const [postType, setPostType] = useState<PostTypeFilter>('ALL');
  const [queue, setQueue] = useState<QueueFilter>('NEEDS_ATTENTION');
  const [search, setSearch] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  // Inspector State
  const [isPostContextOpen, setIsPostContextOpen] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        platform,
        postType,
        queue,
      });
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/comments?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setComments(data.comments);
        if (data.comments.length > 0) {
          // If previous selection is not in list or null, select first
          setSelectedCommentId((prev) => {
            if (prev && data.comments.some((c: any) => c.id === prev)) return prev;
            return data.comments[0].id;
          });
        } else {
          setSelectedCommentId(null);
        }
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  }, [platform, postType, queue, search]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Listen to simulator events
  useEffect(() => {
    const handleRefresh = () => fetchComments();
    window.addEventListener('social_monitor_refresh', handleRefresh);
    return () => window.removeEventListener('social_monitor_refresh', handleRefresh);
  }, [fetchComments]);

  const selectedComment = comments.find((c) => c.id === selectedCommentId) || null;

  // Sync composer with comment draft
  useEffect(() => {
    if (selectedComment) {
      setReplyText(selectedComment.triage?.aiDraftReply || '');
      setFeedbackMessage(null);
    }
  }, [selectedCommentId, selectedComment]);

  // Reply submission
  const handleSendReply = async () => {
    if (!selectedComment || !replyText.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/comments/${selectedComment.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMessage('Reply published natively to Meta and marked as Answered.');
        await fetchComments();
      }
    } catch (err) {
      console.error('Failed to post reply:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Mark answered without replying
  const handleMarkAnswered = async () => {
    if (!selectedComment) return;
    setActionLoading(true);
    try {
      await fetch(`/api/comments/${selectedComment.id}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ANSWERED' }),
      });
      setFeedbackMessage('Thread marked as Answered.');
      await fetchComments();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Hide or unhide comment
  const handleToggleHide = async () => {
    if (!selectedComment) return;
    setActionLoading(true);
    try {
      const newHiddenState = !selectedComment.isHidden;
      await fetch(`/api/comments/${selectedComment.id}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHidden: newHiddenState }),
      });
      setFeedbackMessage(newHiddenState ? 'Comment hidden on Meta.' : 'Comment unhidden on Meta.');
      await fetchComments();
    } catch (err) {
      console.error('Failed to update visibility:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete comment (GDPR)
  const handleDeleteComment = async () => {
    if (!selectedComment) return;
    if (!confirm('Are you sure you want to permanently delete this comment from Meta and the database?')) {
      return;
    }
    setActionLoading(true);
    try {
      await fetch(`/api/comments/${selectedComment.id}`, { method: 'DELETE' });
      setFeedbackMessage('Comment deleted natively and purged from database.');
      await fetchComments();
    } catch (err) {
      console.error('Failed to delete comment:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Tone regeneration
  const handleToneRegen = async (tone: 'shorter' | 'empathetic' | 'cta') => {
    if (!selectedComment) return;
    setToneLoading(true);
    try {
      const res = await fetch(`/api/comments/${selectedComment.id}/tone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone }),
      });
      const data = await res.json();
      if (data.success && data.aiDraftReply) {
        setReplyText(data.aiDraftReply);
      }
    } catch (err) {
      console.error('Tone regen failed:', err);
    } finally {
      setToneLoading(false);
    }
  };

  // Priority / Category override
  const handleOverrideTriage = async (type: 'priority' | 'category', value: string) => {
    if (!selectedComment) return;
    try {
      await fetch(`/api/comments/${selectedComment.id}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: value }),
      });
      await fetchComments();
    } catch (err) {
      console.error('Override failed:', err);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-white dark:bg-slate-950 transition-colors">
      {/* 1. LEFT PANE — Smart Filters & Channels (240px) */}
      <aside className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          {/* Channel Selector */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
              <span>Channel Inboxes</span>
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => setPlatform('ALL')}
                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  platform === 'ALL'
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <span>All Connected Channels</span>
              </button>

              <button
                onClick={() => setPlatform('FACEBOOK')}
                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  platform === 'FACEBOOK'
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-blue-500" />
                  <span>Facebook Pages</span>
                </div>
              </button>

              <button
                onClick={() => setPlatform('INSTAGRAM')}
                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  platform === 'INSTAGRAM'
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-pink-500" />
                  <span>Instagram Business</span>
                </div>
              </button>

              {/* Disabled Phase 2 & Phase 3 Channels */}
              <div className="pt-1 space-y-1">
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-slate-400 dark:text-slate-500 opacity-60 cursor-not-allowed">
                  <span>LinkedIn Company</span>
                  <span className="text-[9px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
                    Phase 2
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-slate-400 dark:text-slate-500 opacity-60 cursor-not-allowed">
                  <span>TikTok Business</span>
                  <span className="text-[9px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
                    Phase 3
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Post Type (Organic vs Dark Ads) */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Post Type
            </h3>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1 text-[11px]">
              {(['ALL', 'ORGANIC', 'PAID'] as PostTypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setPostType(type)}
                  className={`rounded py-1 font-medium transition-all ${
                    postType === type
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {type === 'ALL' ? 'All' : type === 'ORGANIC' ? 'Organic' : 'Paid Ads'}
                </button>
              ))}
            </div>
          </div>

          {/* Triage Queues */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Triage Queues
            </h3>
            <div className="space-y-1">
              {[
                { id: 'NEEDS_ATTENTION', label: 'Needs Attention', icon: Clock },
                { id: 'HIGH_INTENT', label: 'High Intent Leads', icon: Flame },
                { id: 'COMPLAINTS', label: 'Complaints & Support', icon: ShieldAlert },
                { id: 'ANSWERED', label: 'Answered', icon: CheckCheck },
                { id: 'SPAM', label: 'Spam / Hidden', icon: EyeOff },
              ].map((q) => {
                const Icon = q.icon;
                const isCurrent = queue === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => setQueue(q.id as QueueFilter)}
                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                      isCurrent
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${isCurrent ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                      <span>{q.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* System info */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 space-y-1">
          <div className="flex items-center justify-between">
            <span>Rate Limit Budget</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">3.2% Used</span>
          </div>
          <div className="flex items-center justify-between">
            <span>LLM Triage Engine</span>
            <span className="font-mono text-slate-500 dark:text-slate-400">gpt-4o-mini</span>
          </div>
        </div>
      </aside>

      {/* 2. CENTRE PANE — Prioritised Comment Feed (420px) */}
      <section className="w-[420px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col transition-colors">
        {/* Search & Header */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/30 dark:bg-slate-900/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search comments, authors, or captions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-0.5">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {queue === 'NEEDS_ATTENTION'
                ? 'Prioritised Attention Queue'
                : queue === 'HIGH_INTENT'
                ? 'High Intent Leads & Questions'
                : queue === 'COMPLAINTS'
                ? 'Complaints & Support Tickets'
                : queue === 'ANSWERED'
                ? 'Answered Conversations'
                : 'Spam & Hidden Items'}
            </span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {comments.length}
            </span>
          </div>
        </div>

        {/* Comment Cards List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400 dark:text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs">Loading feed...</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 p-6 text-center text-slate-400 dark:text-slate-500">
              <CheckCircle className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Queue is clear</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">No comments match the selected filters.</p>
            </div>
          ) : (
            comments.map((comment) => {
              const isSelected = comment.id === selectedCommentId;
              const isPaid = comment.post.isPaidAd;
              const priority = comment.triage?.priority || 'P3_STANDARD';
              const category = comment.triage?.category || 'GENERAL_CHAT';
              const status = comment.triage?.status || 'UNREAD';
              const isFacebook = comment.post.account.platform === 'FACEBOOK';

              const priorityBadge = {
                P1_CRITICAL: 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900',
                P2_HIGH: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900',
                P3_STANDARD: 'bg-sky-100 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-900',
                P4_LOW: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
              }[priority as 'P1_CRITICAL' | 'P2_HIGH' | 'P3_STANDARD' | 'P4_LOW'];

              return (
                <div
                  key={comment.id}
                  onClick={() => setSelectedCommentId(comment.id)}
                  className={`p-3.5 cursor-pointer transition-colors relative border-l-4 ${
                    isSelected
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-l-indigo-600 dark:border-l-indigo-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/50 border-l-transparent'
                  }`}
                >
                  {/* Top Metadata */}
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Platform Icon */}
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${
                          isFacebook ? 'bg-blue-600' : 'bg-pink-600'
                        }`}
                      >
                        {isFacebook ? 'FB' : 'IG'}
                      </span>

                      {/* Paid Ad Badge */}
                      {isPaid && (
                        <span className="inline-flex items-center rounded border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:text-purple-300">
                          PAID AD
                        </span>
                      )}

                      {/* Priority */}
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${priorityBadge}`}>
                        {priority.replace('_', ' ')}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {formatDistanceToNow(new Date(comment.publishedAt), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Author & snippet */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {comment.authorName}
                      </span>
                      {comment.authorUsername && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                          @{comment.authorUsername}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {comment.body}
                    </p>
                  </div>

                  {/* Status & Category Pills */}
                  <div className="mt-2.5 flex items-center justify-between text-[10px]">
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-600 dark:text-slate-300">
                      {category.replace('_', ' ')}
                    </span>

                    {status === 'DRAFT_READY' ? (
                      <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                        <Sparkles className="h-3 w-3" />
                        <span>Draft Ready</span>
                      </span>
                    ) : status === 'ANSWERED' ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCheck className="h-3 w-3" />
                        <span>
                          {comment.triage?.respondedBy?.includes('Native')
                            ? 'Native Mobile'
                            : 'Dashboard'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">{status}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 3. RIGHT PANE — Thread & Context Inspector (Flex-1) */}
      <main className="flex-1 flex flex-col bg-slate-50/50 dark:bg-slate-950/60 overflow-y-auto">
        {selectedComment ? (
          <div className="p-6 max-w-4xl space-y-6">
            {/* Feedback notification banner */}
            {feedbackMessage && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{feedbackMessage}</span>
                </div>
                <button
                  onClick={() => setFeedbackMessage(null)}
                  className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 font-bold"
                >
                  &times;
                </button>
              </div>
            )}

            {/* A. Collapsible Parent Post Context Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setIsPostContextOpen(!isPostContextOpen)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold text-white ${
                      selectedComment.post.account.platform === 'FACEBOOK'
                        ? 'bg-blue-600'
                        : 'bg-pink-600'
                    }`}
                  >
                    {selectedComment.post.account.platform}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Parent Post Context &bull; {selectedComment.post.account.name}
                  </span>
                  {selectedComment.post.isPaidAd && (
                    <span className="inline-flex items-center rounded border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                      PAID AD (Dark Post)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                  {selectedComment.post.permalink && (
                    <a
                      href={selectedComment.post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded"
                      title="View post on Meta"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {isPostContextOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {isPostContextOpen && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-start gap-4">
                  {selectedComment.post.mediaUrl && (
                    <img
                      src={selectedComment.post.mediaUrl}
                      alt="Post visual"
                      className="h-20 w-20 rounded-lg object-cover border border-slate-200 dark:border-slate-800 shrink-0"
                    />
                  )}
                  <div className="space-y-1.5 text-xs">
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-3">
                      {selectedComment.post.caption || 'No caption available.'}
                    </p>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">
                      Published {formatDistanceToNow(new Date(selectedComment.post.publishedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* B. Conversation Thread (Customer + Nested Brand Replies) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Conversation Thread
              </h3>

              {/* Top-Level Customer Comment */}
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-950 p-3.5 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{selectedComment.authorName}</span>
                      {selectedComment.authorUsername && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">@{selectedComment.authorUsername}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {formatDistanceToNow(new Date(selectedComment.publishedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">{selectedComment.body}</p>
                </div>
              </div>

              {/* Nested Replies */}
              {selectedComment.replies && selectedComment.replies.length > 0 && (
                <div className="pl-6 space-y-3 border-l-2 border-indigo-100 dark:border-indigo-900 ml-4">
                  {selectedComment.replies.map((reply: any) => (
                    <div key={reply.id} className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold">
                        {reply.isFromBrand ? 'A' : 'U'}
                      </div>
                      <div className={`flex-1 rounded-xl p-3 border text-xs leading-relaxed ${
                        reply.isFromBrand
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs">
                            {reply.authorName} {reply.isFromBrand && '(Brand Team)'}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatDistanceToNow(new Date(reply.publishedAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p>{reply.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* C. AI Classification Breakdown & Overrides */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    AI Triage & Classification
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Override Rate KPI: &lt; 15% (Currently 7.4%)
                </span>
              </div>

              {/* Badges & Manual Overrides */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Priority Selector */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/60 dark:bg-slate-950/60">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={selectedComment.triage?.priority || 'P3_STANDARD'}
                    onChange={(e) => handleOverrideTriage('priority', e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="P1_CRITICAL">P1 Critical</option>
                    <option value="P2_HIGH">P2 High</option>
                    <option value="P3_STANDARD">P3 Standard</option>
                    <option value="P4_LOW">P4 Low</option>
                  </select>
                </div>

                {/* Category Selector */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/60 dark:bg-slate-950/60">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Category Tag
                  </label>
                  <select
                    value={selectedComment.triage?.category || 'GENERAL_CHAT'}
                    onChange={(e) => handleOverrideTriage('category', e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="LEAD_ENQUIRY">Lead Enquiry</option>
                    <option value="PRODUCT_QUESTION">Product Question</option>
                    <option value="COMPLAINT_SUPPORT">Complaint / Support</option>
                    <option value="PRAISE">Praise</option>
                    <option value="GENERAL_CHAT">General Chat</option>
                    <option value="SPAM_TROLL">Spam / Troll</option>
                  </select>
                </div>

                {/* Sentiment */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 bg-slate-50/60 dark:bg-slate-950/60">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Sentiment
                  </label>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 py-1">
                    {selectedComment.triage?.sentiment || 'NEUTRAL'}
                  </div>
                </div>
              </div>

              {/* AI Reasoning */}
              {selectedComment.triage?.aiReasoning && (
                <div className="rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 p-3 text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">Triage Reasoning: </span>
                  {selectedComment.triage.aiReasoning}
                </div>
              )}

              {/* Extracted Topic Tags */}
              {selectedComment.triage?.topicTags && selectedComment.triage.topicTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <Tag className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                  {selectedComment.triage.topicTags.map((t: string) => (
                    <span
                      key={t}
                      className="rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 font-mono"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* D. Human-in-the-Loop Reply Composer */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Human-in-the-Loop Reply Composer
                  </h3>
                </div>

                {/* Quick Tone Buttons */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 mr-1">Refine Tone:</span>
                  <button
                    onClick={() => handleToneRegen('shorter')}
                    disabled={toneLoading}
                    className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Shorter
                  </button>
                  <button
                    onClick={() => handleToneRegen('empathetic')}
                    disabled={toneLoading}
                    className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    More Empathetic
                  </button>
                  <button
                    onClick={() => handleToneRegen('cta')}
                    disabled={toneLoading}
                    className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Include CTA
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Draft your response here matching brand voice guidelines..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-600 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-600 leading-relaxed font-sans"
                />
                {toneLoading && (
                  <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs flex items-center justify-center rounded-xl">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-900 dark:text-indigo-200 ml-2">Re-generating draft...</span>
                  </div>
                )}
              </div>

              {/* Primary Actions Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendReply}
                    disabled={actionLoading || !replyText.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    <span>Approve & Post Reply</span>
                  </button>

                  <button
                    onClick={handleMarkAnswered}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Mark Answered (No Reply)</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleToggleHide}
                    disabled={actionLoading}
                    title={selectedComment.isHidden ? 'Unhide comment on Meta' : 'Hide comment on Meta'}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    {selectedComment.isHidden ? (
                      <>
                        <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Unhide</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                        <span>Hide on Meta</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDeleteComment}
                    disabled={actionLoading}
                    title="GDPR Compliant Permanent Deletion"
                    className="flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-2">
            <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Select a comment thread to inspect</p>
          </div>
        )}
      </main>
    </div>
  );
}
