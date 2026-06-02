'use client';
import { useState } from 'react';
import { useUI } from '@/context/UIContext';
import { CheckCircle, AlertCircle, Settings, Mail, MessageSquare, CreditCard, Zap, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

type Integration = {
  id: string;
  name: string;
  description: string;
  status: 'Connected' | 'Available' | 'Error';
  category: string;
  color: string;
  icon: React.ReactNode;
};

export default function Integrations() {
  const { showToast } = useUI();

  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'gmail',
      name: 'Gmail / Google Workspace',
      description: 'Send & receive emails, track replies, and auto-sync contacts to CRM.',
      status: 'Connected',
      category: 'Communication',
      color: 'text-red-500 bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20',
      icon: <Mail size={24} className="text-red-500" />,
    },
    {
      id: 'wati',
      name: 'WATI — WhatsApp API',
      description: 'Send WhatsApp notifications for task alerts, payment reminders, and lead replies.',
      status: 'Connected',
      category: 'Communication',
      color: 'text-emerald-500 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20',
      icon: <MessageSquare size={24} className="text-emerald-500" />,
    },
    {
      id: 'razorpay',
      name: 'Razorpay',
      description: 'Generate payment links, process transactions, and trigger auto-invoicing on payment.',
      status: 'Available',
      category: 'Payments',
      color: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
      icon: <CreditCard size={24} className="text-blue-500" />,
    },
    {
      id: 'zapier',
      name: 'Zapier Automation',
      description: 'Connect OPS Platform to 3000+ apps via trigger-based automation workflows.',
      status: 'Available',
      category: 'Automation',
      color: 'text-orange-500 bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/20',
      icon: <Zap size={24} className="text-orange-500" />,
    },
    {
      id: 'r2',
      name: 'Cloudflare R2 Storage',
      description: 'Secure file storage for client documents, proposal attachments and invoice PDFs.',
      status: 'Error',
      category: 'Storage',
      color: 'text-purple-500 bg-purple-50 border-purple-200 dark:bg-purple-500/10 dark:border-purple-500/20',
      icon: <Settings size={24} className="text-purple-500" />,
    },
  ]);

  const getStatusBadge = (status: Integration['status']) => {
    switch (status) {
      case 'Connected':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"><CheckCircle size={12} /> Connected</span>;
      case 'Error':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"><AlertCircle size={12} /> Error</span>;
      default:
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-base text-secondary border border-border">Available</span>;
    }
  };

  const handleConnect = (id: string) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'Connected' } : i));
    showToast(`Integration connected successfully!`, 'success');
  };

  const handleDisconnect = (id: string) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'Available' } : i));
    showToast(`Integration disconnected`, 'info');
  };

  const handleRetry = (id: string) => {
    showToast(`Retrying connection...`, 'info');
    setTimeout(() => {
      setIntegrations(prev => prev.map(i => i.id === id ? { ...i, status: 'Connected' } : i));
      showToast(`Connection restored!`, 'success');
    }, 1500);
  };

  const categories = [...new Set(integrations.map(i => i.category))];

  return (
    <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-base text-primary transition-colors">
      
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-primary">Integrations</h1>
        <p className="text-secondary text-sm font-medium">Connect OPS Platform to your essential tools — Gmail, WhatsApp, Razorpay, and more.</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-6 mb-10">
        {[
          { label: 'Connected', value: integrations.filter(i => i.status === 'Connected').length, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
          { label: 'Available', value: integrations.filter(i => i.status === 'Available').length, color: 'text-secondary', bg: 'bg-surface border-border' },
          { label: 'Errors', value: integrations.filter(i => i.status === 'Error').length, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
        ].map((s, i) => (
          <div key={i} className={`p-5 rounded-2xl border ${s.bg} flex items-center gap-4 shadow-sm`}>
            <span className={`text-4xl font-extrabold ${s.color}`}>{s.value}</span>
            <span className="text-sm font-bold text-secondary">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Integration cards grouped by category */}
      {categories.map(category => (
        <div key={category} className="mb-10">
          <h2 className="text-xs font-extrabold text-secondary uppercase tracking-widest mb-5 flex items-center gap-2">
            <div className="h-px flex-1 bg-border"></div>
            {category}
            <div className="h-px flex-1 bg-border"></div>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {integrations.filter(i => i.category === category).map((integration, idx) => (
              <motion.div
                key={integration.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                className="p-6 rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md hover:border-accent/40 transition-all flex flex-col gap-5"
              >
                <div className="flex items-start justify-between">
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${integration.color}`}>
                    {integration.icon}
                  </div>
                  {getStatusBadge(integration.status)}
                </div>
                
                <div>
                  <h3 className="text-base font-bold text-primary mb-1.5">{integration.name}</h3>
                  <p className="text-sm text-secondary font-medium leading-relaxed">{integration.description}</p>
                </div>

                <div className="flex gap-3 mt-auto pt-4 border-t border-border">
                  {integration.status === 'Connected' && (
                    <>
                      <button onClick={() => showToast(`Configuring ${integration.name}...`, 'info')} className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold border border-border rounded-lg text-primary hover:border-accent/50 hover:text-accent hover:bg-base transition-colors">
                        <Settings size={14} /> Configure
                      </button>
                      <button onClick={() => handleDisconnect(integration.id)} className="px-4 py-2 text-sm font-bold border border-border rounded-lg text-secondary hover:text-red-500 hover:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        Disconnect
                      </button>
                    </>
                  )}
                  {integration.status === 'Available' && (
                    <button onClick={() => handleConnect(integration.id)} className="flex-1 py-2 text-sm font-bold bg-accent text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-md">
                      Connect
                    </button>
                  )}
                  {integration.status === 'Error' && (
                    <>
                      <button onClick={() => handleRetry(integration.id)} className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                        <RefreshCw size={14} /> Retry
                      </button>
                      <button onClick={() => showToast('Opening error log...', 'info')} className="px-4 py-2 text-sm font-bold border border-border rounded-lg text-secondary hover:text-primary hover:bg-base transition-colors">
                        Logs
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
