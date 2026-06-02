'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { XCircle, RefreshCw } from 'lucide-react';

function GmailErrorContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message') ?? 'Google OAuth was denied or cancelled.';
  const returnTo = searchParams.get('returnTo') ?? '/mr?tab=email';

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <div className="bg-surface border border-border rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <XCircle size={32} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-primary mb-3">Connection Failed</h1>
        <p className="text-secondary text-sm leading-relaxed mb-8">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/api/gmail/oauth?action=connect"
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95"
          >
            <RefreshCw size={16} />
            Try Again
          </Link>
          <Link
            href={returnTo}
            className="px-5 py-2.5 border border-border rounded-xl text-sm font-bold text-secondary hover:text-primary hover:bg-base transition-all"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GmailErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-secondary text-sm font-bold animate-pulse">Loading...</div>
      </div>
    }>
      <GmailErrorContent />
    </Suspense>
  );
}
