'use client';
import { useState, useEffect } from 'react';
import { useUI } from '@/context/UIContext';
import { 
  Search, Plus, FileText, Download, Filter,
  Clock, CheckCircle, AlertCircle,
  Mail, Trash2, Eye, Check, X
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

export default function Invoices() {
  const { showToast } = useUI();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [niClient, setNiClient] = useState('');
  const [niAmount, setNiAmount] = useState('');
  const [niCategory, setNiCategory] = useState('Consulting');
  const [niDueDate, setNiDueDate] = useState('');
  const [niClientEmail, setNiClientEmail] = useState('');
  const [niClientPhone, setNiClientPhone] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  
  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices');
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

  const handleApprove = async (id: string) => {
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
    }
  };

  const handleSendReminder = async (id: string, clientName: string) => {
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
    }
  };

  const handleDelete = async (id: string) => {
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
            <div className="p-12 text-center text-secondary font-bold text-sm">Loading dynamic billing logs...</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-base/50 text-secondary font-bold uppercase tracking-widest border-b border-border">
                <tr>
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
                  {filteredInvoices.map(inv => (
                    <motion.tr key={inv.invoiceId} layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="hover:bg-base/30 transition-colors group cursor-pointer" onClick={() => showToast(`Viewing invoice ${inv.invoiceId}`, 'info')}>
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
                      <td className="px-6 py-4 text-right">
                         <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {inv.status !== 'Paid' && (
                              <button onClick={(e) => { e.stopPropagation(); handleApprove(inv._id!); }} className="p-2 bg-accent text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm" title="Approve Payment"><Check size={14}/></button>
                            )}
                            {inv._id && (
                              <button onClick={(e) => { e.stopPropagation(); window.open(`/pay/${inv._id}`, '_blank'); showToast('Opened payment portal', 'info'); }} className="p-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-sm" title="Open Payment Portal"><Eye size={14}/></button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleSendReminder(inv._id!, inv.client); }} className="p-2 bg-base border border-border rounded-lg hover:text-accent transition-colors" title="Resend Payment Reminder"><Mail size={14}/></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(inv._id!); }} className="p-2 bg-base border border-border rounded-lg hover:text-red-500 transition-colors" title="Delete Invoice"><Trash2 size={14}/></button>
                         </div>
                      </td>
                    </motion.tr>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-secondary font-bold text-sm">No billing entries found</td>
                    </tr>
                  )}
                </AnimatePresence>
              </tbody>
            </table>
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
                  <button onClick={async () => {
                     if(!niClient || !niAmount) { showToast('Please fill all required fields', 'warning'); return; }
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
                     }
                  }} className="px-10 py-2.5 bg-accent text-white font-bold rounded-2xl hover:bg-indigo-600 transition-all shadow-lg active:scale-95 text-xs">Generate Invoice</button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

