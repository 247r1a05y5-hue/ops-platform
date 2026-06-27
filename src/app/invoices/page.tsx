'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUI } from '@/context/UIContext';
import {
  Search, Plus, FileText, Download, Filter,
  Clock, CheckCircle, AlertCircle,
  Mail, Trash2, Eye, Check, X, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadCSV } from '@/utils/export';
import { triggerActivityLog } from '@/utils/activity';

type Invoice = {
  _id?: string;
  invoiceId: string;
  client: string;
  amount: string;
  date: string;
  due: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  category: string;
  paymentLink?: string;
  remindersCount?: number;
};

const STATUS_CLS: Record<string, string> = {
  Paid:    'badge-enterprise badge-enterprise-success',
  Pending: 'badge-enterprise badge-enterprise-info',
  Overdue: 'badge-enterprise badge-enterprise-danger',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  Paid:    <CheckCircle size={10} />,
  Pending: <Clock size={10} />,
  Overdue: <AlertCircle size={10} />,
};

export function InvoicesWorkspace() {
  const { showToast } = useUI();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [niClient, setNiClient] = useState('');
  const [niAmount, setNiAmount] = useState('');
  const [niCategory, setNiCategory] = useState('Consulting');
  const [niDueDate, setNiDueDate] = useState('');
  const [niClientEmail, setNiClientEmail] = useState('');
  const [niClientPhone, setNiClientPhone] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (searchParams?.get('openModal') === 'true') setIsAddModalOpen(true);
  }, [searchParams]);

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setInvoices(data.invoices);
    } catch (err) {
      console.error(err);
      showToast('Failed to load invoices from server', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, []);

  const totalVal   = invoices.reduce((a, c) => a + parseFloat(c.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const paidVal    = invoices.filter(i => i.status === 'Paid').reduce((a, c) => a + parseFloat(c.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const pendingVal = invoices.filter(i => i.status === 'Pending').reduce((a, c) => a + parseFloat(c.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const overdueVal = invoices.filter(i => i.status === 'Overdue').reduce((a, c) => a + parseFloat(c.amount.replace(/[^0-9.]/g, '') || '0'), 0);

  const stats = [
    { label: 'Total Invoiced', value: `$${totalVal.toLocaleString()}`,   icon: FileText,     color: 'text-primary',     dot: 'bg-primary/10' },
    { label: 'Paid',           value: `$${paidVal.toLocaleString()}`,    icon: CheckCircle,  color: 'text-emerald-500', dot: 'bg-emerald-500/10' },
    { label: 'Pending',        value: `$${pendingVal.toLocaleString()}`, icon: Clock,        color: 'text-accent',      dot: 'bg-accent/10' },
    { label: 'Overdue',        value: `$${overdueVal.toLocaleString()}`, icon: AlertCircle,  color: 'text-red-500',     dot: 'bg-red-500/10' },
  ];

  const filteredInvoices = invoices.filter(inv => {
    const q = searchQuery.toLowerCase();
    const matchSearch = inv.client.toLowerCase().includes(q) || inv.invoiceId.toLowerCase().includes(q);
    const matchFilter = activeFilter === 'All' || inv.status === activeFilter;
    return matchSearch && matchFilter;
  });

  const totalPages = Math.ceil(filteredInvoices.length / pageSize);
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
  }, [filteredInvoices.length, pageSize, totalPages, currentPage]);

  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAllPageInvoices = () => {
    const allPageIds = paginatedInvoices.map(inv => inv._id).filter(Boolean) as string[];
    const allSelected = allPageIds.every(id => selectedInvoiceIds.has(id));
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      allSelected ? allPageIds.forEach(id => next.delete(id)) : allPageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleBulkApproveInvoices = async () => {
    showToast(`Bulk approving ${selectedInvoiceIds.size} invoices...`, 'info');
    const ids = Array.from(selectedInvoiceIds);
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/invoices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'approve' }) });
        const d = await res.json();
        if (d.success) ok++;
      } catch (_) {}
    }
    showToast(`Successfully approved ${ok}/${ids.length} invoices`, 'success');
    setSelectedInvoiceIds(new Set());
    fetchInvoices();
  };

  const handleBulkSendReminders = async () => {
    showToast(`Bulk sending reminders for ${selectedInvoiceIds.size} invoices...`, 'info');
    const ids = Array.from(selectedInvoiceIds);
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/invoices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'send_reminder', clientEmail: 'vaishnavioz226@gmail.com' }) });
        const d = await res.json();
        if (d.success) ok++;
      } catch (_) {}
    }
    showToast(`Successfully dispatched reminders for ${ok}/${ids.length} invoices`, 'success');
    setSelectedInvoiceIds(new Set());
    fetchInvoices();
  };

  const handleBulkDeleteInvoices = async () => {
    if (!confirm(`Are you sure you want to permanently delete the ${selectedInvoiceIds.size} selected invoices?`)) return;
    showToast(`Bulk deleting ${selectedInvoiceIds.size} invoices...`, 'info');
    const ids = Array.from(selectedInvoiceIds);
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/invoices?id=${id}`, { method: 'DELETE' });
        const d = await res.json();
        if (d.success) ok++;
      } catch (_) {}
    }
    showToast(`Successfully deleted ${ok}/${ids.length} invoices`, 'success');
    setSelectedInvoiceIds(new Set());
    fetchInvoices();
  };

  const handleApprove = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch('/api/invoices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'approve' }) });
      const data = await res.json();
      if (data.success) {
        setInvoices(prev => prev.map(inv => inv._id === id ? { ...inv, status: 'Paid' } : inv));
        showToast('Invoice approved and marked as Paid!', 'success');
        triggerActivityLog('workflow_action', 'Approved invoice payment');
      } else {
        showToast(data.error || 'Failed to approve invoice', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error updating invoice', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleSendReminder = async (id: string, clientName: string) => {
    setActionLoading(prev => ({ ...prev, [id + '-reminder']: true }));
    try {
      showToast('Sending automated reminder...', 'info');
      const res = await fetch('/api/invoices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'send_reminder', clientEmail: niClientEmail || 'vaishnavioz226@gmail.com' }) });
      const data = await res.json();
      if (data.success) {
        setInvoices(prev => prev.map(inv => inv._id === id ? { ...inv, remindersCount: (inv.remindersCount || 0) + 1 } : inv));
        showToast(`Payment reminder dispatched to ${clientName}!`, 'success');
        triggerActivityLog('workflow_action', `Dispatched manual invoice reminder for ${clientName}`);
      } else {
        showToast(data.error || 'Failed to dispatch reminder', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error sending reminder', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [id + '-reminder']: false }));
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id + '-delete']: true }));
    try {
      const res = await fetch(`/api/invoices?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setInvoices(prev => prev.filter(inv => inv._id !== id));
        showToast('Invoice permanently removed', 'success');
        triggerActivityLog('workflow_action', 'Removed invoice');
      } else {
        showToast(data.error || 'Failed to delete invoice', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error removing invoice', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [id + '-delete']: false }));
    }
  };

  const handleExport = () => {
    downloadCSV(invoices, 'Invoices_Export');
    showToast('Exporting invoices...', 'info');
    triggerActivityLog('file_download', 'Exported Invoices to CSV');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-base text-primary transition-colors min-h-screen">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 lg:p-10 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-secondary/70 uppercase tracking-widest">Finance</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Billing &amp; Invoices</h1>
            <p className="text-sm text-secondary font-medium">Manage client billing, track payments, and follow up on overdue accounts.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={handleExport} className="btn-enterprise-secondary flex items-center gap-2">
              <Download size={15} /> Export
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="btn-enterprise-primary flex items-center gap-2">
              <Plus size={15} /> New Invoice
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="card-enterprise flex items-center gap-4"
            >
              <div className={`w-10 h-10 rounded-xl ${s.dot} flex items-center justify-center shrink-0`}>
                <s.icon size={18} className={s.color} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-0.5">{s.label}</p>
                <p className={`text-2xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Table Card ── */}
        <div className="card-enterprise p-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border-b border-border/60 bg-base/30">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoices…"
                  className="input-enterprise pl-8 py-2 text-xs w-56"
                />
              </div>
              {/* Status filters */}
              <div className="flex items-center bg-surface border border-border/60 rounded-xl p-0.5">
                {['All', 'Paid', 'Pending', 'Overdue'].map(f => (
                  <button
                    key={f}
                    onClick={() => { setActiveFilter(f); setCurrentPage(1); }}
                    className={`px-3.5 py-1.5 rounded-[10px] text-xs font-semibold transition-all duration-150 ${
                      activeFilter === f
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => showToast('Applying advanced filters...', 'info')}
              className="btn-enterprise-secondary flex items-center gap-2 !text-xs"
            >
              <Filter size={13} /> Advanced Filter
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-3">
                    <div className="skeleton-enterprise w-4 h-4 rounded" />
                    <div className="skeleton-enterprise h-3 w-24 rounded" />
                    <div className="skeleton-enterprise h-3 flex-1 rounded" />
                    <div className="skeleton-enterprise h-3 w-20 rounded" />
                    <div className="skeleton-enterprise h-3 w-16 rounded" />
                    <div className="skeleton-enterprise h-5 w-16 rounded-full" />
                    <div className="skeleton-enterprise h-3 w-20 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-accent/8 flex items-center justify-center text-accent mb-1">
                  <FileText size={24} />
                </div>
                <p className="text-sm font-semibold text-primary">No Invoices Found</p>
                <p className="text-xs text-secondary font-medium max-w-xs">No billing records match your query. Create a new invoice to get started.</p>
                <button onClick={() => setIsAddModalOpen(true)} className="btn-enterprise-primary flex items-center gap-2 mt-2">
                  <Plus size={14} /> New Invoice
                </button>
              </div>
            ) : (
              <>
                <table className="table-enterprise">
                  <thead>
                    <tr>
                      <th className="w-10 text-center px-5">
                        <input
                          type="checkbox"
                          checked={paginatedInvoices.length > 0 && paginatedInvoices.every(inv => selectedInvoiceIds.has(inv._id || ''))}
                          onChange={toggleSelectAllPageInvoices}
                          className="w-3.5 h-3.5 rounded border-border accent-accent"
                        />
                      </th>
                      <th className="px-4">Invoice ID</th>
                      <th className="px-4">Client</th>
                      <th className="px-4">Category</th>
                      <th className="px-4">Issue Date</th>
                      <th className="px-4">Amount</th>
                      <th className="px-4">Status</th>
                      <th className="px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {paginatedInvoices.map(inv => {
                        const isExpanded = expandedInvoiceId === inv._id;
                        const isSelected = selectedInvoiceIds.has(inv._id || '');
                        const isActionLoading = actionLoading[inv._id!] || actionLoading[inv._id! + '-reminder'] || actionLoading[inv._id! + '-delete'];
                        return (
                          <>
                            <motion.tr
                              key={inv.invoiceId}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setExpandedInvoiceId(isExpanded ? null : inv._id!)}
                              className={`cursor-pointer group transition-colors ${
                                isExpanded  ? 'bg-accent/3'  :
                                isSelected  ? 'bg-accent/5'  :
                                'hover:bg-accent/[0.02]'
                              }`}
                            >
                              <td className="px-5 text-center" onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectInvoice(inv._id || '')}
                                  className="w-3.5 h-3.5 rounded border-border accent-accent"
                                />
                              </td>
                              <td className="px-4">
                                <span className="font-mono font-bold text-primary text-xs">{inv.invoiceId}</span>
                              </td>
                              <td className="px-4">
                                <div className="font-semibold text-primary group-hover:text-accent transition-colors text-xs">{inv.client}</div>
                                <div className="text-[10px] text-tertiary mt-0.5">Due {inv.due}{inv.remindersCount ? ` · Reminded (${inv.remindersCount})` : ''}</div>
                              </td>
                              <td className="px-4">
                                <span className="badge-enterprise text-[10px] text-secondary bg-base border border-border/60">{inv.category}</span>
                              </td>
                              <td className="px-4 text-xs text-secondary font-medium">{inv.date}</td>
                              <td className="px-4">
                                <span className="font-bold text-primary text-sm">{inv.amount}</span>
                              </td>
                              <td className="px-4">
                                <span className={STATUS_CLS[inv.status] || 'badge-enterprise'}>
                                  {STATUS_ICON[inv.status]} {inv.status}
                                </span>
                              </td>
                              <td className="px-4 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {inv.status !== 'Paid' && (
                                    <button
                                      onClick={() => handleApprove(inv._id!)}
                                      disabled={isActionLoading}
                                      className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-50"
                                      title="Approve Payment"
                                    >
                                      {actionLoading[inv._id!] ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin block" /> : <Check size={12} />}
                                    </button>
                                  )}
                                  {inv._id && (
                                    <button onClick={() => window.open(`/pay/${inv._id}`, '_blank')} className="p-1.5 bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/20 transition-colors" title="Open Payment Portal">
                                      <Eye size={12} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleSendReminder(inv._id!, inv.client)}
                                    disabled={isActionLoading}
                                    className="p-1.5 bg-base border border-border/60 rounded-lg hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-50"
                                    title="Resend Reminder"
                                  >
                                    {actionLoading[inv._id! + '-reminder'] ? <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin block" /> : <Mail size={12} />}
                                  </button>
                                  <button
                                    onClick={() => handleDelete(inv._id!)}
                                    disabled={isActionLoading}
                                    className="p-1.5 bg-base border border-border/60 rounded-lg hover:text-red-500 hover:border-red-500/30 transition-colors disabled:opacity-50"
                                    title="Delete Invoice"
                                  >
                                    {actionLoading[inv._id! + '-delete'] ? <span className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin block" /> : <Trash2 size={12} />}
                                  </button>
                                </div>
                              </td>
                            </motion.tr>

                            {isExpanded && (
                              <tr key={`${inv.invoiceId}-details`} className="bg-accent/[0.015] border-b border-border/40">
                                <td />
                                <td colSpan={7} className="px-6 py-5">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-primary">
                                    <div className="space-y-3">
                                      <p className="text-[10px] font-bold uppercase text-secondary tracking-widest">Client Contact</p>
                                      <div className="p-3 bg-surface border border-border/60 rounded-xl space-y-1.5">
                                        <div>
                                          <span className="text-[10px] text-tertiary">Billing Email:</span>
                                          <div className="font-semibold">{inv.client} Billing</div>
                                        </div>
                                        <div>
                                          <span className="text-[10px] text-tertiary">Category / Tag:</span>
                                          <div className="font-semibold">{inv.category}</div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <p className="text-[10px] font-bold uppercase text-secondary tracking-widest">Billing Info</p>
                                      <div className="p-3 bg-surface border border-border/60 rounded-xl space-y-1.5">
                                        <div>
                                          <span className="text-[10px] text-tertiary">Reminders Dispatched:</span>
                                          <div className="font-semibold">{inv.remindersCount || 0} times</div>
                                        </div>
                                        <div>
                                          <span className="text-[10px] text-tertiary">Due Date:</span>
                                          <div className="font-bold text-rose-500 font-mono">{inv.due}</div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <p className="text-[10px] font-bold uppercase text-secondary tracking-widest">Quick Actions</p>
                                      <div className="flex flex-wrap gap-2">
                                        {inv.status !== 'Paid' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleApprove(inv._id!); }}
                                            disabled={isActionLoading}
                                            className="btn-enterprise-primary flex items-center gap-1.5 !text-[11px] !py-1.5"
                                          >
                                            {actionLoading[inv._id!] ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={11} />}
                                            Mark Paid
                                          </button>
                                        )}
                                        {inv._id && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); window.open(`/pay/${inv._id}`, '_blank'); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 text-accent border border-accent/20 rounded-lg font-bold text-[11px] hover:bg-accent/20 transition-all"
                                          >
                                            <Eye size={11} /> Pay Online
                                          </button>
                                        )}
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleSendReminder(inv._id!, inv.client); }}
                                          disabled={isActionLoading}
                                          className="btn-enterprise-secondary flex items-center gap-1.5 !text-[11px] !py-1.5"
                                        >
                                          {actionLoading[inv._id! + '-reminder'] ? <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Mail size={11} />}
                                          Send Reminder
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); if (confirm('Remove this invoice record permanently?')) handleDelete(inv._id!); }}
                                          disabled={isActionLoading}
                                          className="btn-enterprise-danger flex items-center gap-1.5 !text-[11px] !py-1.5"
                                        >
                                          {actionLoading[inv._id! + '-delete'] ? <span className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={11} />}
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-base/20">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-secondary font-medium">Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      className="select-enterprise !w-auto !py-1 !px-2.5 !text-xs"
                    >
                      {[10, 20, 50].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="text-[11px] text-tertiary font-medium ml-2">
                      {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredInvoices.length)} of {filteredInvoices.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1.5 border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 rounded-lg text-xs font-semibold transition-all"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pg = i + 1;
                      if (totalPages > 5 && pg !== 1 && pg !== totalPages && Math.abs(currentPage - pg) > 1) {
                        if (pg === 2 && currentPage > 3) return <span key={pg} className="text-secondary text-xs px-1">…</span>;
                        if (pg === totalPages - 1 && currentPage < totalPages - 2) return <span key={pg} className="text-secondary text-xs px-1">…</span>;
                        return null;
                      }
                      return (
                        <button
                          key={pg}
                          onClick={() => setCurrentPage(pg)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                            currentPage === pg
                              ? 'bg-accent text-white shadow-sm'
                              : 'border border-border/60 bg-surface text-secondary hover:text-primary'
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    })}
                    <button
                      disabled={currentPage === totalPages || totalPages === 0}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 border border-border/60 bg-surface text-secondary hover:text-primary disabled:opacity-40 rounded-lg text-xs font-semibold transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bulk Action Bar */}
        <AnimatePresence>
          {selectedInvoiceIds.size > 0 && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border/80 rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-5 max-w-lg w-full justify-between backdrop-blur-sm"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/10 text-accent font-bold text-xs flex items-center justify-center">{selectedInvoiceIds.size}</div>
                <span className="text-xs font-semibold text-primary">invoices selected</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleBulkApproveInvoices} className="btn-enterprise-primary !py-1.5 !text-xs flex items-center gap-1.5"><Check size={12}/> Mark Paid</button>
                <button onClick={handleBulkSendReminders} className="btn-enterprise-secondary !py-1.5 !text-xs flex items-center gap-1.5"><Mail size={12}/> Remind</button>
                <button onClick={handleBulkDeleteInvoices} className="btn-enterprise-danger !py-1.5 !text-xs flex items-center gap-1.5"><Trash2 size={12}/> Delete</button>
                <button onClick={() => setSelectedInvoiceIds(new Set())} className="text-xs text-secondary hover:text-primary transition-colors font-semibold px-2">Clear</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ── New Invoice Modal ── */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-enterprise-overlay">
            <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }} className="modal-enterprise-content max-w-lg">
              <div className="p-5 border-b border-border/60 flex justify-between items-center bg-base/30">
                <h2 className="text-base font-bold flex items-center gap-2"><Plus size={16} className="text-accent" /> Create New Invoice</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 hover:bg-base rounded-lg text-secondary hover:text-primary transition-colors"><X size={18} /></button>
              </div>
              <div className="p-6 flex flex-col gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Client Name *</label>
                  <input type="text" value={niClient} onChange={e => setNiClient(e.target.value)} placeholder="e.g. Acme Corp" className="input-enterprise" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Client Email (For Reminders)</label>
                  <input type="email" value={niClientEmail} onChange={e => setNiClientEmail(e.target.value)} placeholder="client@acme.com" className="input-enterprise" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Client Phone (For WhatsApp)</label>
                  <input type="text" value={niClientPhone} onChange={e => setNiClientPhone(e.target.value)} placeholder="e.g. 919284788141" className="input-enterprise" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Category</label>
                    <select value={niCategory} onChange={e => setNiCategory(e.target.value)} className="select-enterprise">
                      <option>Consulting</option>
                      <option>SaaS Retainer</option>
                      <option>Implementation</option>
                      <option>Dev Services</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Amount ($) *</label>
                    <input type="text" value={niAmount} onChange={e => setNiAmount(e.target.value)} placeholder="5000" className="input-enterprise" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-1.5">Due Date</label>
                    <input type="date" value={niDueDate} onChange={e => setNiDueDate(e.target.value)} className="input-enterprise" />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border/60 flex justify-end gap-3 bg-base/20">
                <button onClick={() => setIsAddModalOpen(false)} className="btn-enterprise-secondary">Cancel</button>
                <button
                  onClick={async () => {
                    if (!niClient || !niAmount) { showToast('Please fill all required fields', 'warning'); return; }
                    setCreatingInvoice(true);
                    try {
                      const res = await fetch('/api/invoices', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          client: niClient, clientEmail: niClientEmail, clientPhone: niClientPhone,
                          amount: `$${niAmount}`, category: niCategory,
                          due: niDueDate ? new Date(niDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Next Month'
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        setInvoices([data.invoice, ...invoices]);
                        setIsAddModalOpen(false);
                        setNiClient(''); setNiAmount(''); setNiDueDate(''); setNiClientEmail(''); setNiClientPhone('');
                        showToast('Invoice created and sent to client!', 'success');
                        triggerActivityLog('workflow_action', `Generated new invoice ${data.invoice.invoiceId} for ${niClient}`);
                      } else {
                        showToast(data.error || 'Failed to create invoice', 'error');
                      }
                    } catch (err) {
                      console.error(err);
                      showToast('Network error generating invoice', 'error');
                    } finally {
                      setCreatingInvoice(false);
                    }
                  }}
                  disabled={creatingInvoice}
                  className="btn-enterprise-primary flex items-center gap-2"
                >
                  {creatingInvoice && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {creatingInvoice ? 'Generating…' : 'Generate Invoice'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Invoices() {
  return (
    <Suspense fallback={<div className="p-8 text-secondary">Loading billing logs and invoices...</div>}>
      <InvoicesWorkspace />
    </Suspense>
  );
}
