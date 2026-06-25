'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import {
  CheckCircle, XCircle, FileText, Calendar, DollarSign, Loader2,
  Lock, AlertCircle, Building2, User, HelpCircle, ArrowRight
} from 'lucide-react';

export default function ClientProposalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [lead, setLead] = useState<any>(null);

  // Response states
  const [submitting, setSubmitting] = useState(false);
  const [responseAction, setResponseAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [responseSuccess, setResponseSuccess] = useState<string | null>(null);

  const fetchProposalDetails = async () => {
    if (!id || !token) {
      setError('Secure token and proposal ID are required to access this page.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/proposals/${id}/track?token=${token}`);
      const data = await res.json();

      if (data.success) {
        setProposal(data.proposal);
        setLead(data.lead);
      } else {
        setError(data.error || 'Failed to load the proposal. Please contact your Account Manager.');
      }
    } catch (err) {
      setError('A network error occurred while fetching the proposal. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposalDetails();
  }, [id, token]);

  const handleResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responseAction) return;

    if (responseAction === 'approve' && !signatureName.trim()) {
      alert('Please enter your name to sign the proposal.');
      return;
    }

    if (responseAction === 'reject' && !rejectionReason.trim()) {
      alert('Please provide a brief reason for declining the proposal.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/proposals/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: responseAction,
          reason: responseAction === 'reject' ? rejectionReason : undefined,
          signer: responseAction === 'approve' ? signatureName : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResponseSuccess(data.message);
        // Refresh proposal details to show updated status
        await fetchProposalDetails();
      } else {
        alert(data.error || 'Failed to submit response.');
      }
    } catch (err) {
      alert('A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
        <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
        <p className="text-sm font-medium tracking-wide">Retrieving secure proposal details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-6 border border-rose-500/20">
          <Lock size={28} />
        </div>
        <h1 className="text-xl font-bold text-slate-100 mb-2">Access Restrained</h1>
        <p className="text-slate-400 text-sm max-w-md leading-relaxed">{error}</p>
      </div>
    );
  }

  const primaryColor = proposal.branding?.primaryColor || '#4f46e5';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Banner */}
      <div className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-md" style={{ backgroundColor: primaryColor }}>
              {proposal.branding?.companyName?.[0] || 'A'}
            </div>
            <div>
              <span className="text-sm font-bold text-slate-200">{proposal.branding?.companyName || 'Company'}</span>
              <p className="text-[10px] text-slate-400 font-medium">{proposal.branding?.tagline || 'Business Services'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400">Proposal v{proposal.version}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              proposal.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              proposal.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
              'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            }`}>
              {proposal.status.toUpperCase()}
            </span>
            {proposal.pdfUrl && (
              <a
                href={proposal.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
              >
                <FileText size={12} /> View PDF
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 space-y-8">
        
        {/* Success/Status Alert */}
        {responseSuccess && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex gap-3 items-center">
            <CheckCircle size={20} className="shrink-0" />
            <div className="text-xs font-semibold">{responseSuccess}</div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Main Proposal Body */}
          <div className="lg:col-span-2 space-y-8">
            <div className="p-8 bg-slate-900/60 border border-slate-800/80 rounded-3xl space-y-6 shadow-xl shadow-slate-950/20">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">{proposal.title}</h1>
                {proposal.subtitle && <p className="text-slate-400 text-sm mt-1">{proposal.subtitle}</p>}
              </div>

              {/* Client and Partner details */}
              <div className="grid grid-cols-2 gap-6 p-4 bg-slate-950/50 border border-slate-800/40 rounded-2xl text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">PREPARED FOR</span>
                  <div className="font-bold text-slate-200">{lead?.name || 'Client Representative'}</div>
                  <div className="text-slate-400 font-medium mt-0.5">{lead?.company || 'Acme Corp'}</div>
                  <div className="text-slate-500 mt-1">{lead?.email || ''}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">PREPARED BY</span>
                  <div className="font-bold text-slate-200">{proposal.signatureName || 'Account Executive'}</div>
                  <div className="text-slate-400 font-medium mt-0.5">{proposal.signatureTitle || 'Representative'}</div>
                  <div className="text-slate-500 mt-1">{proposal.branding?.companyName || 'Antigravity OPS'}</div>
                </div>
              </div>

              {/* Introduction Text */}
              <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {proposal.introduction}
              </div>

              {/* Services Table */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Scope & Itemized Services</span>
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/30">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-4 w-1/3">Service</th>
                        <th className="p-4 w-1/3">Description</th>
                        <th className="p-4 text-right">Rate</th>
                        <th className="p-4 text-center">Qty</th>
                        <th className="p-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.services?.map((svc: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-850 hover:bg-slate-900/30 transition-colors">
                          <td className="p-4 font-bold text-slate-200">{svc.name}</td>
                          <td className="p-4 text-slate-400">{svc.description}</td>
                          <td className="p-4 text-right font-mono text-slate-300">
                            {svc.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-4 text-center font-mono text-slate-400">
                            {svc.quantity} <span className="text-[10px] font-normal text-slate-500">/{svc.unit || 'unit'}</span>
                          </td>
                          <td className="p-4 text-right font-bold font-mono text-slate-200">
                            {(svc.price * svc.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Box */}
              <div className="flex justify-end pt-2">
                <div className="w-full md:w-80 p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {proposal.currency} {proposal.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {proposal.discount > 0 && (
                    <div className="flex justify-between items-center text-xs text-rose-400">
                      <span>Discount ({proposal.discount}%):</span>
                      <span className="font-mono font-semibold">
                        - {proposal.currency} {(proposal.subtotal * (proposal.discount / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {proposal.tax > 0 && (
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span>Tax ({proposal.tax}%):</span>
                      <span className="font-mono font-semibold text-slate-200">
                        {proposal.currency} {((proposal.subtotal * (1 - proposal.discount / 100)) * (proposal.tax / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm font-bold border-t border-slate-800 pt-2 mt-2">
                    <span className="text-white">Total Value:</span>
                    <span className="font-mono text-indigo-400">
                      {proposal.currency} {proposal.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Milestones timeline */}
              {proposal.milestones && proposal.milestones.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Execution Milestones & Schedule</span>
                  <div className="relative pl-6 border-l-2 border-slate-850 space-y-6">
                    {proposal.milestones.map((ms: any, idx: number) => (
                      <div key={idx} className="relative">
                        {/* Node icon */}
                        <div
                          className="absolute -left-[31px] top-0 w-4 h-4 rounded-full border-4 border-slate-950 flex items-center justify-center shadow-inner"
                          style={{ backgroundColor: primaryColor }}
                        />
                        <div className="space-y-1">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-xs font-bold text-slate-200">{ms.name}</span>
                            <span className="text-[10px] font-mono text-slate-500 font-bold bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full shrink-0">
                              {ms.dueDate}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{ms.description}</p>
                          {ms.deliverables && ms.deliverables.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1.5">
                              {ms.deliverables.map((del: string, didx: number) => (
                                <span key={didx} className="px-2 py-0.5 bg-slate-950 border border-slate-850 rounded text-[9px] text-slate-500 font-bold">
                                  ✓ {del}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes Block */}
              {proposal.notes && (
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 text-amber-300 rounded-2xl text-xs leading-relaxed">
                  <span className="font-bold block mb-1">Special Proposal Notes</span>
                  {proposal.notes}
                </div>
              )}

              {/* Terms Block */}
              {proposal.terms && (
                <div className="pt-4 border-t border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Terms & Conditions</span>
                  <div className="text-[10px] text-slate-400 leading-relaxed font-medium">
                    {proposal.terms}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Response Panel */}
          <div className="space-y-6">
            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-3xl space-y-4 shadow-xl shadow-slate-950/20">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Proposal Response Desk</span>
              
              {proposal.status === 'approved' ? (
                <div className="space-y-4 text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Proposal Approved</h3>
                    <p className="text-[10px] text-slate-500 mt-1">This proposal has been accepted and signed.</p>
                  </div>
                </div>
              ) : proposal.status === 'rejected' ? (
                <div className="space-y-4 text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
                    <XCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Proposal Declined</h3>
                    <p className="text-[10px] text-rose-400/80 mt-1">Declined: &quot;{proposal.rejectionReason || 'No reason provided.'}&quot;</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">
                    Please review this contract scope. You can accept the terms or decline the proposal using the action desk below.
                  </p>
                  
                  {!responseAction ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setResponseAction('approve')}
                        className="py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border border-indigo-500/20"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => setResponseAction('reject')}
                        className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleResponse} className="space-y-3">
                      {responseAction === 'approve' ? (
                        <div className="space-y-2">
                          <span className="text-[10px] text-slate-400 font-semibold block">Full Name (E-Signature)</span>
                          <input
                            type="text"
                            required
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                            placeholder="Sign with your name"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="text-[10px] text-slate-400 font-semibold block">Decline Reason</span>
                          <textarea
                            required
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium resize-none"
                            placeholder="Please explain why you decline..."
                          />
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={submitting}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        >
                          {submitting ? 'Submitting...' : 'Submit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setResponseAction(null)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700/80 rounded-xl text-xs font-bold transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Proposal Expiry block */}
            {proposal.validUntil && (
              <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-3xl text-xs text-slate-400 leading-relaxed font-semibold flex items-center gap-3">
                <Calendar size={18} className="text-indigo-400 shrink-0" />
                <div>
                  <span className="text-slate-300 block">Offer Validity</span>
                  <span className="text-[10px] font-mono text-slate-400">Valid until {new Date(proposal.validUntil).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 text-[10px] text-slate-500 font-medium py-6 px-6 shrink-0 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-between items-center gap-4">
          <span>{proposal.footerText || `© ${new Date().getFullYear()} ${proposal.branding?.companyName || 'Antigravity OPS'}. Confidential Document.`}</span>
          <span className="font-mono">Secure Token Ref: {proposal.secureToken.slice(0, 10)}...</span>
        </div>
      </footer>
    </div>
  );
}
