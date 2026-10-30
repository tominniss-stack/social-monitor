import Link from 'next/link';

export const metadata = {
  title: 'Access denied — Aether Intelligence',
};

export default function AccessDeniedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Access denied</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your identity could not be verified by the application. If you have just signed in through
          Cloudflare Access, your session may have expired or this application may be misconfigured.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
