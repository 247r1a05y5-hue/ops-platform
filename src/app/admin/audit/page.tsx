'use client';
import { useState, useEffect, useCallback } from 'react';
import { Shield, Search, RefreshCw, ChevronLeft, ChevronRight, Download, AlertCircle, Laptop, Smartphone, HelpCircle, Eye } from 'lucide-react';

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

const BADGE: Record<string, string> = {
  login: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  logout: 'bg-stone-500/10 text-stone-600 dark:text-stone-400 border border-stone-500/20',
  signup: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20',
  create_lead: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  update_stage: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
  create_task: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
  update_task: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/20',
  create_invoice: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20',
  approve_invoice: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
  pay_invoice: 'bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-600/20',
  workflow_approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  workflow_rejected: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
  upload_document: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
  delete_document: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
  webhook_retry: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
};

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

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
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

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, moduleFilter, startDate, endDate]);

  const fmt = (ts: string) =>
    new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
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
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
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
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium transition-opacity hover:opacity-90 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2 bg-base border border-border rounded-lg text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Search action, actor, ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="w-full px-3 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          <option value="">All Actions</option>
          {actionTypes.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="w-full px-3 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
        >
          <option value="">All Modules</option>
          {modules.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            title="Start Date"
            className="flex-1 px-2 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none"
          />
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            title="End Date"
            className="flex-1 px-2 py-2 bg-base border border-border rounded-lg text-sm text-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 text-sm text-secondary">
        <span>{pagination.total.toLocaleString()} records found</span>
        <span>
          Page {pagination.page} of {pagination.pages || 1}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-base">
                <th className="w-10 px-4 py-3"></th>
                {['Timestamp', 'Actor', 'Action', 'Module', 'Target Entity', 'IP Address'].map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-secondary font-semibold tracking-wider text-xs uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 animate-pulse">
                    {[35, 120, 110, 100, 150, 100, 80].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-base rounded" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-secondary italic">
                    No audit records match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const isExpanded = expandedLogId === log._id;
                  return (
                    <span key={log._id} className="table-row-group">
                      <tr
                        className={`border-b border-border/50 hover:bg-base/50 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-base/20' : ''
                        }`}
                        onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                      >
                        <td className="px-4 py-3 text-center">
                          <span
                            className="inline-block transition-transform duration-200"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                          >
                            <ChevronRight size={14} className="text-secondary" />
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-secondary whitespace-nowrap">
                          {fmt(log.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-primary">{log.performedBy}</div>
                          <div className="text-xs text-secondary font-medium">{log.performedByRole}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${BADGE[log.action] || 'bg-base text-secondary border border-border'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-primary">{log.module}</div>
                          <div className="text-xs text-secondary font-mono">Workspace: {log.workspace}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-primary">{log.entityType}</div>
                          <div className="text-xs text-secondary font-mono">{log.entityId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {log.device === 'Mobile' ? (
                              <Smartphone className="w-3.5 h-3.5 text-secondary" />
                            ) : log.device === 'Tablet' ? (
                              <Smartphone className="w-3.5 h-3.5 text-secondary" />
                            ) : (
                              <Laptop className="w-3.5 h-3.5 text-secondary" />
                            )}
                            <span className="font-mono text-xs font-medium text-secondary">{log.ipAddress}</span>
                          </div>
                          <div className="text-[10px] text-secondary mt-0.5">
                            {log.browser} • {log.device}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-base/10 border-b border-border/50">
                          <td colSpan={7} className="px-6 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs text-primary">
                              <div className="space-y-4">
                                <div className="p-3 bg-surface border border-border rounded-xl">
                                  <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">
                                    Raw User Agent
                                  </span>
                                  <p className="font-mono text-[11px] leading-relaxed break-all text-secondary">
                                    {log.userAgent}
                                  </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="p-3 bg-surface border border-border rounded-xl">
                                    <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">
                                      Affected Entity ID
                                    </span>
                                    <p className="font-mono font-semibold">{log.entityId}</p>
                                  </div>
                                  <div className="p-3 bg-surface border border-border rounded-xl">
                                    <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">
                                      Entity Type
                                    </span>
                                    <p className="font-semibold">{log.entityType}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div>
                                  <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">
                                    Old State
                                  </span>
                                  {log.oldValue && Object.keys(log.oldValue).length > 0 ? (
                                    <pre className="p-3 bg-surface border border-border border-red-500/10 rounded-xl font-mono text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
                                      {JSON.stringify(log.oldValue, null, 2)}
                                    </pre>
                                  ) : (
                                    <div className="p-3 bg-surface border border-border rounded-xl text-secondary italic">
                                      None (Creation Event)
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block mb-1">
                                    New State
                                  </span>
                                  {log.newValue && Object.keys(log.newValue).length > 0 ? (
                                    <pre className="p-3 bg-surface border border-border border-emerald-500/10 rounded-xl font-mono text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
                                      {JSON.stringify(log.newValue, null, 2)}
                                    </pre>
                                  ) : (
                                    <div className="p-3 bg-surface border border-border rounded-xl text-secondary italic">
                                      None (Deletion Event)
                                    </div>
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
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="p-2 rounded-lg border border-border bg-surface text-secondary hover:text-primary disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-secondary font-medium px-2">
            {page} / {pagination.pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages || loading}
            className="p-2 rounded-lg border border-border bg-surface text-secondary hover:text-primary disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

