'use client';
import { useState, useEffect, useCallback } from 'react';
import { Shield, Search, RefreshCw, ChevronLeft, ChevronRight, Download, AlertCircle, Clock, User, Activity, X, Filter } from 'lucide-react';

type AuditLog = {
  _id: string; name: string; userEmail: string; userRole: string;
  actionType: string; module: string; description: string;
  metadata?: Record<string, unknown>; ip: string; timestamp: string;
};

const BADGE: Record<string, string> = {
  login: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  approval_approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  approval_rejected: 'bg-red-500/10 text-red-500',
  approval_requested: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  export_csv: 'bg-blue-500/10 text-blue-500',
  scheduled_emails_cron: 'bg-cyan-500/10 text-cyan-500',
  task_overdue_cron: 'bg-orange-500/10 text-orange-500',
  workflow_action: 'bg-indigo-500/10 text-indigo-500',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionType, setActionType] = useState('');
  const [module, setModule] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ page: String(page), limit: '50', ...(search && { search }), ...(actionType && { actionType }), ...(module && { module }), ...(from && { from }), ...(to && { to }) });
      const res = await fetch(`/api/admin/audit?${p}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []); setPagination(data.pagination);
      if (data.meta?.actionTypes) setActionTypes(data.meta.actionTypes);
      if (data.meta?.modules) setModules(data.meta.modules);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [page, search, actionType, module, from, to]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [search, actionType, module, from, to]);

  const fmt = (ts: string) => new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const downloadCSV = () => {
    const rows = [['Timestamp','User','Email','Role','Action','Module','Description','IP'], ...logs.map(l => [fmt(l.timestamp), l.name, l.userEmail, l.userRole, l.actionType, l.module, `"${(l.description||'').replace(/"/g,'""')}"`, l.ip])];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `audit-${new Date().toISOString().split('T')[0]}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><Shield className="w-5 h-5 text-accent" /></div>
          <div><h1 className="text-xl font-bold text-primary">Audit Log</h1><p className="text-xs text-secondary">Immutable system event records</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLogs} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-secondary hover:text-primary transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={downloadCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary pointer-events-none" />
          <input className="w-full pl-9 pr-3 py-2 bg-base border border-border rounded-lg text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-1 focus:ring-accent" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="w-full px-3 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent" value={actionType} onChange={e => setActionType(e.target.value)}>
          <option value="">All Actions</option>
          {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="w-full px-3 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent" value={module} onChange={e => setModule(e.target.value)}>
          <option value="">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} title="From" className="flex-1 px-2 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} title="To" className="flex-1 px-2 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 text-sm text-secondary">
        <span>{pagination.total.toLocaleString()} entries</span>
        <span>Page {pagination.page} / {pagination.pages}</span>
      </div>

      {error && <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm mb-4"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-base">
                <th className="w-10 px-4 py-3"></th>
                {['Timestamp','User','Action','Module','Description','IP'].map(h => (
                  <th key={h} className={`text-left px-4 py-3 text-secondary font-medium ${h === 'Description' ? 'hidden lg:table-cell' : ''} ${h === 'IP' ? 'hidden xl:table-cell' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50 animate-pulse">
                  {[40,140,120,100,80,200,80].map((w,j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-base rounded" style={{width:w}} /></td>)}
                </tr>
              )) : logs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-secondary">No logs found.</td></tr>
              ) : logs.map(log => {
                const isExpanded = expandedLogId === log._id;
                return (
                  <>
                    <tr key={log._id} className={`border-b border-border/50 hover:bg-base/50 cursor-pointer transition-colors ${isExpanded ? 'bg-base/20' : ''}`} onClick={() => setExpandedLogId(isExpanded ? null : log._id)}>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          <ChevronRight size={14} className="text-secondary" />
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-secondary whitespace-nowrap">{fmt(log.timestamp)}</td>
                      <td className="px-4 py-3"><div className="font-medium text-primary">{log.name}</div><div className="text-xs text-secondary">{log.userRole}</div></td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[log.actionType] || 'bg-base text-secondary'}`}>{log.actionType}</span></td>
                      <td className="px-4 py-3 text-secondary">{log.module}</td>
                      <td className="px-4 py-3 text-secondary max-w-xs truncate hidden lg:table-cell">{log.description}</td>
                      <td className="px-4 py-3 font-mono text-xs text-secondary hidden xl:table-cell">{log.ip}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${log._id}-details`} className="bg-base/10 border-b border-border/50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-primary">
                            <div className="space-y-3">
                              <div>
                                <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block">Full Description</span>
                                <p className="text-sm mt-1 font-medium">{log.description}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block">User Email</span>
                                  <p className="font-semibold mt-0.5">{log.userEmail}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block">IP Address</span>
                                  <p className="font-mono mt-0.5">{log.ip}</p>
                                </div>
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">Metadata</span>
                              {log.metadata && Object.keys(log.metadata).length > 0 ? (
                                <pre className="p-3 bg-surface border border-border rounded-xl font-mono text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              ) : (
                                <span className="text-secondary italic">No metadata available</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page<=1||loading} className="p-2 rounded-lg border border-border bg-surface text-secondary hover:text-primary disabled:opacity-40 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm text-secondary px-2">{page} / {pagination.pages}</span>
          <button onClick={() => setPage(p => Math.min(pagination.pages, p+1))} disabled={page>=pagination.pages||loading} className="p-2 rounded-lg border border-border bg-surface text-secondary hover:text-primary disabled:opacity-40 transition-colors"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
