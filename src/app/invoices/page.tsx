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

  // Pagination & Bulk Selection states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  // Command Palette deep linking trigger
  useEffect(() => {
    if (searchParams) {
      if (searchParams.get('openModal') === 'true') {
        setIsAddModalOpen(true);
      }
    }
  }, [searchParams]);
  
  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load invoices from server', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Recalculate stats dynamically
  const totalVal = invoices.reduce((acc, curr) => acc + parseFloat(curr.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const paidVal = invoices.filter(inv => inv.status === 'Paid').reduce((acc, curr) => acc + parseFloat(curr.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const pendingVal = invoices.filter(inv => inv.status === 'Pending').reduce((acc, curr) => acc + parseFloat(curr.amount.replace(/[^0-9.]/g, '') || '0'), 0);
  const overdueVal = invoices.filter(inv => inv.status === 'Overdue').reduce((acc, curr) => acc + parseFloat(curr.amount.replace(/[^0-9.]/g, '') || '0'), 0);

  const stats = [
    { label: 'Total Invoiced', value: `$${totalVal.toLocaleString()}`, icon: FileText, color: 'text-primary' },
    { label: 'Paid', value: `$${paidVal.toLocaleString()}`, icon: CheckCircle, color: 'text-emerald-500' },
    { label: 'Pending', value: `$${pendingVal.toLocaleString()}`, icon: Clock, color: 'text-blue-500' },
    { label: 'Overdue', value: `$${overdueVal.toLocaleString()}`, icon: AlertCircle, color: 'text-red-500' },
  ];

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.client.toLowerCase().includes(searchQuery.toLowerCase()) || inv.invoiceId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || inv.status === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredInvoices.length / pageSize);
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [filteredInvoices.length, pageSize, totalPages, currentPage]);

  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPageInvoices = () => {
    const allPageIds = paginatedInvoices.map(inv => inv._id).filter(Boolean) as string[];
    const allSelected = allPageIds.every(id => selectedInvoiceIds.has(id));
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allPageIds.forEach(id => next.delete(id));
      } else {
        allPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleBulkApproveInvoices = async () => {
    showToast(`Bulk approving ${selectedInvoiceIds.size} invoices...`, 'info');
    const ids = Array.from(selectedInvoiceIds);
    let successCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/invoices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'approve' })
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
        }
      } catch (_) {}
    }
    showToast(`Successfully approved ${successCount}/${ids.length} invoices`, 'success');
    setSelectedInvoiceIds(new Set());
    fetchInvoices();
  };

  const handleBulkSendReminders = async () => {
    showToast(`Bulk sending reminders for ${selectedInvoiceIds.size} invoices...`, 'info');
    const ids = Array.from(selectedInvoiceIds);
    let successCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/invoices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            action: 'send_reminder',
            clientEmail: 'vaishnavioz226@gmail.com'
          })
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
        }
      } catch (_) {}
    }
    showToast(`Successfully dispatched reminders for ${successCount}/${ids.length} invoices`, 'success');
    setSelectedInvoiceIds(new Set());
    fetchInvoices();
  };

  const handleBulkDeleteInvoices = async () => {
    if (!confirm(`Are you sure you want to permanently delete the ${selectedInvoiceIds.size} selected invoices?`)) return;
    showToast(`Bulk deleting ${selectedInvoiceIds.size} invoices...`, 'info');
    const ids = Array.from(selectedInvoiceIds);
    let successCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/invoices?id=${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
          successCount++;
        }
      } catch (_) {}
    }
    showToast(`Successfully deleted ${successCount}/${ids.length} invoices`, 'success');
    setSelectedInvoiceIds(new Set());
    fetchInvoices();
  };

  const handleApprove = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' })
      });
      const data = await res.json();
      if (data.success) {
        setInvoices(prev => prev.map(inv => inv._id === id ? { ...inv, status: 'Paid' } : inv));
        showToast(`Invoice approved and marked as Paid!`, 'success');
        triggerActivityLog('workflow_action', `Approved invoice payment`);
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
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action: 'send_reminder',
          clientEmail: niClientEmail || 'vaishnavioz226@gmail.com'
        })
      });
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
      const res = await fetch(`/api/invoices?id=${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setInvoices(prev => prev.filter(inv => inv._id !== id));
        showToast('Invoice permanently removed', 'success');
        triggerActivityLog('workflow_action', `Removed invoice`);
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
    <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-base text-primary transition-colors min-h-screen">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Billing & Invoices</h1>
          <p className="text-secondary text-sm font-medium">Manage client billing, track payments, and follow up on overdue accounts.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleExport} className="flex items-center gap-2 px-5 py-2.5 border border-border bg-surface text-primary rounded-xl text-xs font-bold hover:bg-base transition-all shadow-sm active:scale-95">
             <Download size={16} /> Export Reports
          </button>
          <button onClick={() => { setIsAddModalOpen(true); }} className="flex items-center gap-2 px-6 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:bg-emerald-600 transition-all active:scale-95 cursor-pointer z-20">
             <Plus size={18} /> New Invoice
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {stats.map((s, i) => (
          <motion.div key={i} initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{delay: i * 0.05}} className="p-6 rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest">{s.label}</h3>
               <div className={`w-8 h-8 rounded-lg bg-current/10 flex items-center justify-center ${s.color}`}>
                 <s.icon size={14} className={s.color} />
               </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-primary">{s.value}</div>
            <div className="mt-2 h-1 w-full bg-border rounded-full overflow-hidden">
               <div className={`h-full bg-current rounded-full ${s.color}`} style={{width: '65%'}}></div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters & Table */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base/30">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoices..." 
                className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-xs w-64 focus:outline-none focus:border-accent transition-all text-primary font-medium shadow-sm"
              />
            </div>
            <div className="flex bg-surface border border-border rounded-xl p-1 shadow-inner">
               {['All', 'Paid', 'Pending', 'Overdue'].map(f => (
                 <button 
                  key={f} 
                  onClick={() => setActiveFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeFilter === f ? 'bg-base text-accent shadow-sm ring-1 ring-border/50' : 'text-secondary hover:text-primary'}`}>{f}</button>
               ))}
            </div>
          </div>
          <button onClick={() => showToast('Applying advanced filters...', 'info')} className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-secondary hover:text-primary transition-colors">
            <Filter size={14} /> Advanced Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-4 animate-pulse">
              <div className="h-10 bg-border rounded w-full"></div>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-surface border border-border rounded-xl flex items-center justify-between px-6">
                  <div className="w-1/6 h-4 bg-border rounded"></div>
                  <div className="w-1/4 h-4 bg-border rounded"></div>
                  <div className="w-1/12 h-4 bg-border rounded"></div>
                  <div className="w-1/12 h-4 bg-border rounded"></div>
                  <div className="w-1/12 h-4 bg-border rounded"></div>
                </div>
              ))}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-surface/50 border border-dashed border-border rounded-2xl m-6 text-center shadow-inner">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-4">
                <FileText size={32} />
              </div>
              <h3 className="text-lg font-bold text-primary mb-1">No Invoices Found</h3>
              <p className="text-secondary text-sm mb-6 max-w-sm font-medium">There are no billing logs matching your query. Create a new invoice to get started.</p>
              <button 
                onClick={() => setIsAddModalOpen(true)} 
                className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-md hover:bg-emerald-600 transition-colors cursor-pointer active:scale-95"
              >
                <Plus size={16} /> New Invoice
              </button>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto max-h-[600px] border border-border bg-base rounded-2xl shadow-inner mb-4 relative">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-surface border-b border-border text-secondary font-bold uppercase tracking-widest z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-4 w-12 text-center">
                        <input 
                          type="checkbox" 
                          checked={paginatedInvoices.length > 0 && paginatedInvoices.every(inv => selectedInvoiceIds.has(inv._id || ''))}
                          onChange={toggleSelectAllPageInvoices}
                          className="w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent"
                        />
                      </th>
                      <th className="px-6 py-4">Invoice ID</th>
                      <th className="px-6 py-4">Client</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Issue Date</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
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
                              initial={{opacity:0}} 
                              animate={{opacity:1}} 
                              exit={{opacity:0}} 
                              className={`hover:bg-base/30 transition-colors group cursor-pointer ${isExpanded ? 'bg-base/20' : ''} ${isSelected ? 'bg-accent/5' : ''}`}
                              onClick={() => setExpandedInvoiceId(isExpanded ? null : inv._id!)}
                            >
                              <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => toggleSelectInvoice(inv._id || '')}
                                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent"
                                />
                              </td>
                              <td className="px-6 py-4 font-bold text-primary">{inv.invoiceId}</td>
                              <td className="px-6 py-4">
                                 <div className="font-bold text-primary group-hover:text-accent transition-colors">{inv.client}</div>
                                 <div className="text-[10px] text-tertiary mt-0.5">Due {inv.due} {inv.remindersCount ? `· Reminded (${inv.remindersCount})` : ''}</div>
                              </td>
                              <td className="px-6 py-4">
                                 <span className="px-2 py-0.5 bg-surface border border-border rounded text-[10px] font-bold text-secondary">{inv.category}</span>
                              </td>
                              <td className="px-6 py-4 text-secondary font-semibold">{inv.date}</td>
                              <td className="px-6 py-4">
                                 <div className="font-bold text-primary text-sm">{inv.amount}</div>
                              </td>
                              <td className="px-6 py-4">
                                 <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold text-[10px] tracking-wider uppercase ${
                                   inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                                   inv.status === 'Pending' ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' :
                                   'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                                 }`}>
                                    {inv.status === 'Paid' ? <CheckCircle size={12}/> : inv.status === 'Pending' ? <Clock size={12}/> : <AlertCircle size={12}/>}
                                    {inv.status}
                                 </span>
                              </td>
                              <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                 <div className="flex justify-end gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                    {inv.status !== 'Paid' && (
                                      <button 
                                        onClick={() => handleApprove(inv._id!)} 
                                        disabled={isActionLoading}
                                        className="p-2 bg-accent text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center animate-none" 
                                        title="Approve Payment"
                                      >
                                        {actionLoading[inv._id!] ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <Check size={14}/>}
                                      </button>
                                    )}
                                    {inv._id && (
                                      <button onClick={() => window.open(`/pay/${inv._id}`, '_blank')} className="p-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-sm" title="Open Payment Portal"><Eye size={14}/></button>
                                    )}
                                    <button 
                                      onClick={() => handleSendReminder(inv._id!, inv.client)} 
                                      disabled={isActionLoading}
                                      className="p-2 bg-base border border-border rounded-lg hover:text-accent transition-colors disabled:opacity-50 flex items-center justify-center" 
                                      title="Resend Payment Reminder"
                                    >
                                      {actionLoading[inv._id! + '-reminder'] ? <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span> : <Mail size={14}/>}
                                    </button>
                                    <button 
                                      onClick={() => handleDelete(inv._id!)} 
                                      disabled={isActionLoading}
                                      className="p-2 bg-base border border-border rounded-lg hover:text-red-500 transition-colors disabled:opacity-50 flex items-center justify-center" 
                                      title="Delete Invoice"
                                    >
                                      {actionLoading[inv._id! + '-delete'] ? <span className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></span> : <Trash2 size={14}/>}
                                    </button>
                                 </div>
                              </td>
                            </motion.tr>
                            {isExpanded && (
                              <tr key={`${inv.invoiceId}-details`} className="bg-base/10">
                                <td></td>
                                <td colSpan={7} className="px-8 py-6">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-primary">
                                    <div className="space-y-2">
                                      <span className="text-[10px] font-bold uppercase text-secondary tracking-widest block">Client Contact details</span>
                                      <div>
                                        <span className="text-[10px] text-tertiary">Billing Email:</span>
                                        <div className="font-semibold">{inv.client} Billing</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-tertiary">Category / Tag:</span>
                                        <div className="font-semibold">{inv.category}</div>
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <span className="text-[10px] font-bold uppercase text-secondary tracking-widest block">Billing Status Info</span>
                                      <div>
                                        <span className="text-[10px] text-tertiary">Reminders Dispatched:</span>
                                        <div className="font-semibold">{inv.remindersCount || 0} times</div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-tertiary">Due Date:</span>
                                        <div className="font-semibold text-rose-500 font-mono">{inv.due}</div>
                                      </div>
                                    </div>
                                    <div className="space-y-3 flex flex-col justify-center">
                                      <span className="text-[10px] font-bold uppercase text-secondary tracking-widest block mb-1">Available Quick Actions</span>
                                      <div className="flex flex-wrap gap-2">
                                        {inv.status !== 'Paid' && (
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleApprove(inv._id!); }} 
                                            disabled={isActionLoading}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-xl font-bold shadow-md hover:bg-emerald-600 transition-all active:scale-95 text-[11px] disabled:opacity-50"
                                          >
                                            {actionLoading[inv._id!] ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <Check size={12}/>} Mark Paid
                                          </button>
                                        )}
                                        {inv._id && (
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); window.open(`/pay/${inv._id}`, '_blank'); }} 
                                            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white rounded-xl font-bold shadow-md hover:bg-indigo-600 transition-all active:scale-95 text-[11px]"
                                          >
                                            <Eye size={12}/> Pay Online
                                          </button>
                                        )}
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); handleSendReminder(inv._id!, inv.client); }} 
                                          disabled={isActionLoading}
                                          className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border text-primary rounded-xl font-bold hover:text-accent hover:border-accent/40 transition-all active:scale-95 text-[11px] disabled:opacity-50"
                                        >
                                          {actionLoading[inv._id! + '-reminder'] ? <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span> : <Mail size={12}/>} Send Reminder
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); if (confirm('Remove this invoice record permanently?')) handleDelete(inv._id!); }} 
                                          disabled={isActionLoading}
                                          className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-red-500/20 text-red-500 rounded-xl font-bold hover:bg-red-500/10 transition-all active:scale-95 text-[11px] disabled:opacity-50"
                                        >
                                          {actionLoading[inv._id! + '-delete'] ? <span className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></span> : <Trash2 size={12}/>} Delete Record
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
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center justify-between p-4 border border-border bg-surface shrink-0 rounded-2xl shadow-sm mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-secondary font-medium">Rows per page:</span>
                  <select 
                    value={pageSize} 
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="bg-base border border-border rounded-lg text-xs font-bold px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}
                  </select>
                  <span className="text-xs text-tertiary font-bold ml-4">
                    Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredInvoices.length)} of {filteredInvoices.length} invoices
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 border border-border bg-base text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-all"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const page = i + 1;
                    if (totalPages > 5 && page !== 1 && page !== totalPages && Math.abs(currentPage - page) > 1) {
                      if (page === 2 && currentPage > 3) return <span key={page} className="text-secondary text-xs">...</span>;
                      if (page === totalPages - 1 && currentPage < totalPages - 2) return <span key={page} className="text-secondary text-xs">...</span>;
                      return null;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          currentPage === page ? 'bg-accent text-white shadow-md shadow-accent/15' : 'border border-border bg-base text-secondary hover:text-primary'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button 
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-3 py-1.5 border border-border bg-base text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>

              {/* Floating Bulk Selection Action Bar */}
              <AnimatePresence>
                {selectedInvoiceIds.size > 0 && (
                  <motion.div 
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 50, opacity: 0 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border rounded-2xl shadow-2xl p-4 flex items-center gap-6 max-w-lg w-full justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-accent/10 text-accent font-bold text-xs flex items-center justify-center shadow-inner">
                        {selectedInvoiceIds.size}
                      </div>
                      <span className="text-xs font-bold text-primary">invoices selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleBulkApproveInvoices}
                        className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all active:scale-95 shadow-sm"
                      >
                        Mark Paid
                      </button>
                      <button 
                        onClick={handleBulkSendReminders}
                        className="px-4 py-2 bg-accent/10 border border-accent/20 text-accent rounded-xl text-xs font-bold hover:bg-accent/20 transition-all active:scale-95 shadow-sm"
                      >
                        Remind Client
                      </button>
                      <button 
                        onClick={handleBulkDeleteInvoices}
                        className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                      <button 
                        onClick={() => setSelectedInvoiceIds(new Set())}
                        className="px-3 py-2 text-secondary hover:text-primary transition-colors text-xs font-bold"
                      >
                        Clear
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* New Invoice Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div initial={{scale:0.95,y:20}} animate={{scale:1,y:0}} exit={{scale:0.95,y:20}} className="bg-surface w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden">
               <div className="p-6 border-b border-border flex justify-between items-center bg-base/50">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Plus size={18} className="text-accent" /> Create New Invoice</h2>
                  <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-base rounded-xl text-secondary hover:text-primary transition-colors"><X size={20}/></button>
               </div>
               <div className="p-8 flex flex-col gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Client Name *</label>
                    <input type="text" value={niClient} onChange={e=>setNiClient(e.target.value)} placeholder="e.g. Acme Corp" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Client Email (For Reminders)</label>
                    <input type="email" value={niClientEmail} onChange={e=>setNiClientEmail(e.target.value)} placeholder="client@acme.com" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Client Phone (For WhatsApp Reminders)</label>
                    <input type="text" value={niClientPhone} onChange={e=>setNiClientPhone(e.target.value)} placeholder="e.g. 919284788141" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Category</label>
                      <select value={niCategory} onChange={e=>setNiCategory(e.target.value)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent font-bold text-sm appearance-none text-primary">
                         <option>Consulting</option>
                         <option>SaaS Retainer</option>
                         <option>Implementation</option>
                         <option>Dev Services</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Amount ($) *</label>
                      <input type="text" value={niAmount} onChange={e=>setNiAmount(e.target.value)} placeholder="5000" className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                    </div>
                    <div className="col-span-2">
                       <label className="block text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">Due Date</label>
                       <input type="date" value={niDueDate} onChange={e=>setNiDueDate(e.target.value)} className="w-full px-5 py-3 border border-border bg-base rounded-2xl focus:outline-none focus:border-accent transition-all font-medium text-sm text-primary" />
                    </div>
                  </div>
               </div>
               <div className="p-6 border-t border-border flex justify-end gap-3 bg-base/50">
                  <button onClick={() => setIsAddModalOpen(false)} className="px-6 py-2.5 text-xs font-bold text-secondary hover:text-primary transition-colors">Cancel</button>
                  <button 
                    onClick={async () => {
                      if(!niClient || !niAmount) { showToast('Please fill all required fields', 'warning'); return; }
                      setCreatingInvoice(true);
                      try {
                        const res = await fetch('/api/invoices', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            client: niClient,
                            clientEmail: niClientEmail,
                            clientPhone: niClientPhone,
                            amount: `$${niAmount}`,
                            category: niCategory,
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
                    className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-indigo-600 transition-all shadow-lg active:scale-95 text-xs disabled:opacity-50 flex items-center gap-2"
                  >
                    {creatingInvoice && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                    {creatingInvoice ? 'Generating...' : 'Generate Invoice'}
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

