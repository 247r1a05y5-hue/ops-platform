'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { CheckCircle, Mail } from 'lucide-react';

function GmailSuccessContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const returnTo = searchParams.get('returnTo') ?? '/mr?tab=email';

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <div className="bg-surface border border-border rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={32} className="text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-primary mb-3">Gmail Connected!</h1>
        {email ? (
          <p className="text-secondary text-sm leading-relaxed mb-2">
            Connected as <strong className="text-primary">{email}</strong>
          </p>
        ) : null}
        <p className="text-secondary text-sm leading-relaxed mb-8">
          You can now send campaign emails directly from the Outreach Hub using your Gmail account.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href={returnTo}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 hover:bg-indigo-600 transition-all active:scale-95"
          >
            <Mail size={16} />
            Return to Outreach Hub
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GmailSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-secondary text-sm font-bold animate-pulse">Loading...</div>
      </div>
    }>
      <GmailSuccessContent />
    </Suspense>
  );
}
