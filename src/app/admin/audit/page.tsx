'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, RefreshCw, ChevronLeft, ChevronRight,
  Download, AlertCircle, Laptop, Smartphone, ChevronRight as Expand
} from 'lucide-react';

type AuditLog = {
  _id: string;
  action: string;
  module: string;
  entityId: string;
  entityType: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  performedBy: string;
  performedByRole: string;
  workspace: string;
  ipAddress: string;
  userAgent: string;
  browser: string;
  device: string;
  timestamp: string;
};

const ACTION_BADGE: Record<string, string> = {
  login:             'badge-enterprise badge-enterprise-success',
  logout:            'badge-enterprise',
  signup:            'badge-enterprise badge-enterprise-success',
  create_lead:       'badge-enterprise badge-enterprise-info',
  update_stage:      'badge-enterprise badge-enterprise-info',
  create_task:       'badge-enterprise badge-enterprise-info',
  update_task:       'badge-enterprise badge-enterprise-info',
  create_invoice:    'badge-enterprise badge-enterprise-warning',
  approve_invoice:   'badge-enterprise badge-enterprise-success',
  pay_invoice:       'badge-enterprise badge-enterprise-success',
  workflow_approved: 'badge-enterprise badge-enterprise-success',
  workflow_rejected: 'badge-enterprise badge-enterprise-danger',
  upload_document:   'badge-enterprise badge-enterprise-info',
  delete_document:   'badge-enterprise badge-enterprise-danger',
  webhook_retry:     'badge-enterprise badge-enterprise-warning',
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_BADGE[action] || 'badge-enterprise';
  return <span className={cls}>{action.replace(/_/g, ' ')}</span>;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [userPresenceMap, setUserPresenceMap] = useState<Record<string, { isOnline?: boolean; suspended?: boolean }>>({});

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '25',
        ...(search && { search }),
        ...(actionFilter && { action: actionFilter }),
        ...(moduleFilter && { module: moduleFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      const res = await fetch(`/api/admin/audit?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 25, pages: 1 });
      if (data.meta?.actionTypes) setActionTypes(data.meta.actionTypes);
      if (data.meta?.modules) setModules(data.meta.modules);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, actionFilter, moduleFilter, startDate, endDate]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [search, actionFilter, moduleFilter, startDate, endDate]);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.users) {
          const pMap: Record<string, { isOnline?: boolean; suspended?: boolean }> = {};
          data.users.forEach((u: any) => {
            pMap[u.name.toLowerCase()] = { isOnline: u.isOnline, suspended: u.suspended };
            pMap[u.email.toLowerCase()] = { isOnline: u.isOnline, suspended: u.suspended };
          });
          setUserPresenceMap(pMap);
        }
      })
      .catch(console.error);
  }, []);

  const fmt = (ts: string) =>
    new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const downloadCSV = () => {
    const params = new URLSearchParams({
      format: 'csv',
      ...(search && { search }),
      ...(actionFilter && { action: actionFilter }),
      ...(moduleFilter && { module: moduleFilter }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    });
    window.open(`/api/admin/audit?${params}`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-base text-primary transition-colors min-h-screen">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary">Enterprise Audit Logs</h1>
              <p className="text-xs text-secondary font-medium mt-0.5">Immutable audit trail of system events</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="btn-enterprise-secondary flex items-center gap-1.5 !text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={downloadCSV}
              className="btn-enterprise-primary flex items-center gap-1.5 !text-xs"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="card-enterprise p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-secondary pointer-events-none" />
            <input
              className="input-enterprise pl-8 py-2 text-xs"
              placeholder="Search action, actor, ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select-enterprise py-2 text-xs"
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
          >
            <option value="">All Actions</option>
            {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            className="select-enterprise py-2 text-xs"
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
          >
            <option value="">All Modules</option>
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="flex gap-2">
            <input
              type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              title="Start Date"
              className="input-enterprise flex-1 py-2 text-xs"
            />
            <input
              type="date" value={endDate}
              onChange={e => setEndDate(e.target.value)}
              title="End Date"
              className="input-enterprise flex-1 py-2 text-xs"
            />
          </div>
        </div>

        {/* Record count */}
        <div className="flex items-center justify-between text-xs text-secondary font-medium -mt-2">
          <span>{pagination.total.toLocaleString()} records found</span>
          <span>Page {pagination.page} of {pagination.pages || 1}</span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* ── Table ── */}
        <div className="card-enterprise p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th className="w-10 px-4" />
                  {['Timestamp', 'Actor', 'Action', 'Module', 'Target Entity', 'IP Address'].map(h => (
                    <th key={h} className="px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      {[10, 120, 110, 100, 80, 120, 80].map((w, j) => (
                        <td key={j} className="px-4 py-3.5">
                          <div className="skeleton-enterprise h-3 rounded" style={{ width: w }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-base border border-border flex items-center justify-center mb-1">
                          <Shield className="w-5 h-5 text-tertiary" />
                        </div>
                        <p className="text-sm font-semibold text-secondary">No audit records match the current filters</p>
                        <p className="text-xs text-tertiary">Try adjusting your search or date range</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const isExpanded = expandedLogId === log._id;
                    return (
                      <span key={log._id} className="table-row-group">
                        <tr
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-accent/[0.025]' : 'hover:bg-accent/[0.015]'}`}
                          onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                        >
                          <td className="px-4 py-3.5 text-center">
                            <span
                              className="inline-block transition-transform duration-150 text-secondary"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            >
                              <Expand size={13} />
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-[11px] text-secondary whitespace-nowrap">{fmt(log.timestamp)}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-semibold text-primary text-xs">{log.performedBy}</div>
                                <div className="text-[10px] text-secondary font-medium mt-0.5">{log.performedByRole}</div>
                              </div>
                              {(() => {
                                const presence = userPresenceMap[log.performedBy.toLowerCase()];
                                if (!presence) return null;
                                return (
                                  <span
                                    title={presence.suspended ? 'Suspended' : presence.isOnline ? 'Online' : 'Offline'}
                                    className={`w-2.5 h-2.5 rounded-full shrink-0 border border-white/10 ${
                                      presence.suspended ? 'bg-rose-500' : presence.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                    }`}
                                  />
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <ActionBadge action={log.action} />
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-primary text-xs">{log.module}</div>
                            <div className="text-[10px] text-secondary font-mono mt-0.5">{log.workspace}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-primary text-xs">{log.entityType}</div>
                            <div className="text-[10px] text-secondary font-mono mt-0.5 max-w-[120px] truncate">{log.entityId}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {log.device === 'Mobile' || log.device === 'Tablet'
                                ? <Smartphone className="w-3 h-3 text-secondary" />
                                : <Laptop className="w-3 h-3 text-secondary" />
                              }
                              <span className="font-mono text-[11px] text-secondary">{log.ipAddress}</span>
                            </div>
                            <div className="text-[10px] text-tertiary mt-0.5">{log.browser} · {log.device}</div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-accent/[0.015] border-b border-border/40">
                            <td />
                            <td colSpan={6} className="px-6 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs text-primary">
                                <div className="space-y-3">
                                  <div className="p-3 bg-surface border border-border/60 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1.5">Raw User Agent</span>
                                    <p className="font-mono text-[10px] leading-relaxed break-all text-secondary">{log.userAgent}</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-surface border border-border/60 rounded-xl">
                                      <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">Entity ID</span>
                                      <p className="font-mono font-semibold text-[11px] break-all">{log.entityId}</p>
                                    </div>
                                    <div className="p-3 bg-surface border border-border/60 rounded-xl">
                                      <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">Entity Type</span>
                                      <p className="font-semibold text-[11px]">{log.entityType}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div>
                                    <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1.5">Old State</span>
                                    {log.oldValue && Object.keys(log.oldValue).length > 0 ? (
                                      <pre className="p-3 bg-surface border border-red-500/10 border-l-2 border-l-red-500/40 rounded-xl font-mono text-[10px] overflow-x-auto max-h-40 overflow-y-auto text-secondary">
                                        {JSON.stringify(log.oldValue, null, 2)}
                                      </pre>
                                    ) : (
                                      <div className="p-3 bg-surface border border-border/60 rounded-xl text-secondary text-[11px] italic">None (Creation Event)</div>
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1.5">New State</span>
                                    {log.newValue && Object.keys(log.newValue).length > 0 ? (
                                      <pre className="p-3 bg-surface border border-emerald-500/10 border-l-2 border-l-emerald-500/40 rounded-xl font-mono text-[10px] overflow-x-auto max-h-40 overflow-y-auto text-secondary">
                                        {JSON.stringify(log.newValue, null, 2)}
                                      </pre>
                                    ) : (
                                      <div className="p-3 bg-surface border border-border/60 rounded-xl text-secondary text-[11px] italic">None (Deletion Event)</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </span>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60 bg-base/20">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-secondary font-semibold px-2">{page} / {pagination.pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages || loading}
                className="p-1.5 rounded-lg border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
