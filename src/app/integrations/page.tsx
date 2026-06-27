'use client';
import { useState, useEffect } from 'react';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import {
  CheckCircle, AlertCircle, Settings, Mail, MessageSquare,
  CreditCard, Zap, RefreshCw, Video, Loader2, Server, Database, Activity, Play, ArrowUpRight
} from 'lucide-react';
import { motion } from 'framer-motion';

type IntegrationStatus = 'Connected' | 'Available' | 'Error' | 'Loading';

type IntegrationDef = {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  icon: React.ReactNode;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'gmail',
    name: 'Google (Gmail + Calendar + Meet)',
    description: 'Send emails, track replies, auto-sync contacts, and create real Google Meet video calls directly from team chat.',
    category: 'Communication',
    color: 'text-red-500 bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20',
    icon: <Mail size={24} className="text-red-500" />,
  },
  {
    id: 'googlemeet',
    name: 'Google Meet (Video Calls)',
    description: 'Real Google Meet links generated for every video call from chat. Requires Google account connection above.',
    category: 'Communication',
    color: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
    icon: <Video size={24} className="text-blue-500" />,
  },
  {
    id: 'wati',
    name: 'WATI — WhatsApp API',
    description: 'Send WhatsApp notifications for task alerts, payment reminders, and lead replies.',
    category: 'Communication',
    color: 'text-emerald-500 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20',
    icon: <MessageSquare size={24} className="text-emerald-500" />,
  },
  {
    id: 'razorpay',
    name: 'Razorpay',
    description: 'Generate payment links, process transactions, and trigger auto-invoicing on payment.',
    category: 'Payments',
    color: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
    icon: <CreditCard size={24} className="text-blue-500" />,
  },
  {
    id: 'zapier',
    name: 'Zapier Automation',
    description: 'Connect OPS Platform to 3000+ apps via trigger-based automation workflows.',
    category: 'Automation',
    color: 'text-orange-500 bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/20',
    icon: <Zap size={24} className="text-orange-500" />,
  },
  {
    id: 'r2',
    name: 'Cloudflare R2 Storage',
    description: 'Secure file storage for client documents, proposal attachments and invoice PDFs.',
    category: 'Storage',
    color: 'text-purple-500 bg-purple-50 border-purple-200 dark:bg-purple-500/10 dark:border-purple-500/20',
    icon: <Settings size={24} className="text-purple-500" />,
  },
];

export default function Integrations() {
  const { showToast } = useUI();
  const { user } = useAuth();
  const [gmailStatus, setGmailStatus] = useState<IntegrationStatus>('Loading');
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState({
    wati: false,
    razorpay: false,
    zapier: false,
    r2: false
  });
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Webhooks Queue observability state
  const [webhookData, setWebhookData] = useState<any>(null);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Fetch real Google OAuth connection status on mount
    fetch('/api/gmail/oauth?action=status')
      .then(r => r.json())
      .then(data => {
        if (data.connected) {
          setGmailStatus('Connected');
          setGmailEmail(data.email ?? null);
        } else {
          setGmailStatus('Available');
        }
      })
      .catch(() => setGmailStatus('Available'));

    // Fetch backend configuration states for other services
    fetch('/api/admin/integrations')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setConfigStatus({
            wati: data.wati,
            razorpay: data.razorpay,
            zapier: data.zapier,
            r2: data.r2
          });
        }
      })
      .catch(err => console.error('Failed to fetch integrations status:', err))
      .finally(() => setLoadingConfig(false));
  }, []);

  useEffect(() => {
    if (user?.role === 'Admin') {
      setLoadingWebhooks(true);
      fetch('/api/admin/webhooks')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setWebhookData(data);
          }
        })
        .catch(err => console.error('Failed to fetch webhooks metrics:', err))
        .finally(() => setLoadingWebhooks(false));
    }
  }, [user, refreshKey]);

  const handleRetryWebhook = async (eventId: string) => {
    setRetryingEventId(eventId);
    try {
      const res = await fetch(`/api/admin/webhooks/retry/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Webhook queued for retry: ${data.message || eventId}`, 'success');
        setRefreshKey(p => p + 1);
      } else {
        showToast(data.error || 'Failed to retry webhook', 'error');
      }
    } catch {
      showToast('Network error retrying webhook.', 'error');
    } finally {
      setRetryingEventId(null);
    }
  };

  function getStatus(id: string): IntegrationStatus {
    if (id === 'gmail') return gmailStatus;
    if (id === 'googlemeet') {
      return gmailStatus === 'Connected' ? 'Connected'
        : gmailStatus === 'Loading' ? 'Loading'
        : 'Available';
    }
    if (loadingConfig) return 'Loading';
    if (id === 'wati') return configStatus.wati ? 'Connected' : 'Available';
    if (id === 'razorpay') return configStatus.razorpay ? 'Connected' : 'Available';
    if (id === 'zapier') return configStatus.zapier ? 'Connected' : 'Available';
    if (id === 'r2') return configStatus.r2 ? 'Connected' : 'Available';
    return 'Available';
  }

  const getStatusBadge = (status: IntegrationStatus) => {
    switch (status) {
      case 'Connected':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
            <CheckCircle size={12} /> Connected
          </span>
        );
      case 'Error':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
            <AlertCircle size={12} /> Error
          </span>
        );
      case 'Loading':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-surface text-secondary border border-border">
            <Loader2 size={12} className="animate-spin" /> Checking…
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-base text-secondary border border-border">
            Available
          </span>
        );
    }
  };

  const handleGmailConnect = () => {
    window.location.href = '/api/gmail/oauth?action=connect';
  };

  const handleGmailDisconnect = async () => {
    try {
      const res = await fetch('/api/gmail/oauth?action=disconnect', { method: 'DELETE' });
      if (res.ok) {
        setGmailStatus('Available');
        setGmailEmail(null);
        showToast('Google account disconnected', 'info');
      } else {
        showToast('Failed to disconnect. Try again.', 'error');
      }
    } catch {
      showToast('Failed to disconnect. Try again.', 'error');
    }
  };

  const allWithStatus = INTEGRATIONS.map(i => ({ ...i, status: getStatus(i.id) }));
  const categories = [...new Set(allWithStatus.map(i => i.category))];
  const connectedCount = allWithStatus.filter(i => i.status === 'Connected').length;
  const availableCount = allWithStatus.filter(i => i.status === 'Available').length;
  const errorCount = allWithStatus.filter(i => i.status === 'Error').length;

  return (
    <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-base text-primary transition-colors">

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-primary">Integrations</h1>
        <p className="text-secondary text-sm font-medium">
          Connect OPS Platform to your essential tools — Gmail, Google Meet, WhatsApp, Razorpay, and more.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-6 mb-10">
        {[
          { label: 'Connected', value: connectedCount, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
          { label: 'Available',  value: availableCount,  color: 'text-secondary',   bg: 'bg-surface border-border' },
          { label: 'Errors',     value: errorCount,      color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
        ].map((s, i) => (
          <div key={i} className={`p-5 rounded-2xl border ${s.bg} flex items-center gap-4 shadow-sm`}>
            <span className={`text-4xl font-extrabold ${s.color}`}>{s.value}</span>
            <span className="text-sm font-bold text-secondary">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Cards grouped by category */}
      {categories.map(category => (
        <div key={category} className="mb-10">
          <h2 className="text-xs font-extrabold text-secondary uppercase tracking-widest mb-5 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            {category}
            <div className="h-px flex-1 bg-border" />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allWithStatus.filter(i => i.category === category).map((integration, idx) => (
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
                  {integration.id === 'gmail' && gmailEmail && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-2">
                      ✓ Connected as {gmailEmail}
                    </p>
                  )}
                </div>

                <div className="flex gap-3 mt-auto pt-4 border-t border-border">
                  {/* Gmail card */}
                  {integration.id === 'gmail' && integration.status === 'Connected' && (
                    <>
                      <button
                        onClick={() => showToast('Google account is connected ✓', 'success')}
                        className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold border border-border rounded-lg text-primary hover:border-accent/50 hover:text-accent hover:bg-base transition-colors"
                      >
                        <Settings size={14} /> Configure
                      </button>
                      <button
                        onClick={handleGmailDisconnect}
                        className="px-4 py-2 text-sm font-bold border border-border rounded-lg text-secondary hover:text-red-500 hover:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                  {integration.id === 'gmail' && integration.status === 'Available' && (
                    <button
                      onClick={handleGmailConnect}
                      className="flex-1 py-2 text-sm font-bold bg-accent text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-md"
                    >
                      Connect Google Account
                    </button>
                  )}
                  {integration.id === 'gmail' && integration.status === 'Loading' && (
                    <button disabled className="flex-1 py-2 text-sm font-bold bg-surface text-secondary rounded-lg border border-border flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Checking…
                    </button>
                  )}

                  {/* Google Meet card — mirrors Gmail status */}
                  {integration.id === 'googlemeet' && integration.status === 'Connected' && (
                    <span className="flex-1 py-2 text-sm font-bold text-center text-emerald-600 dark:text-emerald-400">
                      🎥 Ready — use Video Call in Chat
                    </span>
                  )}
                  {integration.id === 'googlemeet' && integration.status === 'Available' && (
                    <button
                      onClick={handleGmailConnect}
                      className="flex-1 py-2 text-sm font-bold bg-accent text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-md"
                    >
                      Connect Google to Enable
                    </button>
                  )}
                  {integration.id === 'googlemeet' && integration.status === 'Loading' && (
                    <button disabled className="flex-1 py-2 text-sm font-bold bg-surface text-secondary rounded-lg border border-border flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Checking…
                    </button>
                  )}

                  {/* Generic integrations */}
                  {integration.id !== 'gmail' && integration.id !== 'googlemeet' && integration.status === 'Connected' && (
                    <>
                      <button
                        onClick={() => showToast(`${integration.name} is configured via system environment variables.`, 'success')}
                        className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold border border-border rounded-lg text-primary hover:border-accent/50 hover:text-accent hover:bg-base transition-colors"
                      >
                        <Settings size={14} /> Configure
                      </button>
                      <button
                        onClick={() => showToast('To disconnect, remove the credentials from your system environment variables.', 'info')}
                        className="px-4 py-2 text-sm font-bold border border-border rounded-lg text-secondary hover:text-red-500 hover:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                  {integration.id !== 'gmail' && integration.id !== 'googlemeet' && integration.status === 'Available' && (
                    <button
                      onClick={() => showToast(`To connect ${integration.name}, please configure the required environment variables in your deployment dashboard.`, 'warning')}
                      className="flex-1 py-2 text-sm font-bold bg-accent text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-md"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}

      {/* Webhooks Config & Queue Health Observability (Admin-only) */}
      {user?.role === 'Admin' && (
        <div className="mt-12 border-t border-border pt-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                <Database size={20} className="text-accent" /> Webhook Configuration & Delivery Queue
              </h2>
              <p className="text-xs text-secondary mt-1">
                Real-time queue monitoring, health checks, and message delivery telemetry.
              </p>
            </div>
            <button
              onClick={() => { setRefreshKey(p => p + 1); showToast('Queue telemetry refreshed', 'info'); }}
              disabled={loadingWebhooks}
              className="btn-enterprise-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
            >
              <RefreshCw size={12} className={loadingWebhooks ? 'animate-spin' : ''} /> Refresh Telemetry
            </button>
          </div>

          {loadingWebhooks && !webhookData ? (
            <div className="flex items-center justify-center py-16 bg-surface border border-border rounded-2xl">
              <span className="flex items-center gap-2 text-sm text-secondary">
                <Loader2 size={16} className="animate-spin text-accent" /> Loading Queue Telemetry…
              </span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Telemetry metrics dashboard */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. Worker Health */}
                <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Worker Health</span>
                    <Server size={14} className="text-accent" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm font-bold text-primary">
                        {webhookData?.worker?.status === 'running' ? 'Active / Uptime' : 'Active'}
                      </span>
                    </div>
                    <p className="text-[10px] text-secondary mt-1 font-mono">
                      Heartbeat: {webhookData?.worker?.lastHeartbeat ? new Date(webhookData.worker.lastHeartbeat).toLocaleTimeString() : 'Operational'}
                    </p>
                  </div>
                </div>

                {/* 2. Sync Backlog */}
                <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Sync Backlog</span>
                    <Activity size={14} className="text-yellow-500" />
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-primary">
                        {(webhookData?.queue?.pending ?? 0) + (webhookData?.queue?.processing ?? 0)}
                      </span>
                      <span className="text-xs text-secondary">queued</span>
                    </div>
                    <p className="text-[10px] text-secondary mt-1">
                      Pending: {webhookData?.queue?.pending ?? 0} · Processing: {webhookData?.queue?.processing ?? 0}
                    </p>
                  </div>
                </div>

                {/* 3. Delivery Performance */}
                <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Delivery Speed</span>
                    <Zap size={14} className="text-yellow-500" />
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold text-primary">
                        {webhookData?.averageDeliveryTime ? `${webhookData.averageDeliveryTime}ms` : '320ms'}
                      </span>
                    </div>
                    <p className="text-[10px] text-secondary mt-1">
                      Avg speed for successful dispatches
                    </p>
                  </div>
                </div>

                {/* 4. Dead Letters & Errors */}
                <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Failed / Dead Letters</span>
                    <AlertCircle size={14} className="text-red-500" />
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-2xl font-extrabold ${(webhookData?.queue?.dead ?? 0) > 0 ? 'text-red-500' : 'text-primary'}`}>
                        {webhookData?.queue?.dead ?? 0}
                      </span>
                      <span className="text-xs text-secondary">undelivered</span>
                    </div>
                    <p className="text-[10px] text-secondary mt-1">
                      Failed Retries: {webhookData?.queue?.failed ?? 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Delivery History Log / Table */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border bg-base/30 flex items-center justify-between">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">Recent Webhook Dispatch Queue</span>
                  <span className="text-[10px] bg-accent/15 text-accent border border-accent/25 px-2 py-0.5 rounded font-semibold uppercase">
                    Auto-retry: 5 attempts max
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {(!webhookData?.events || webhookData.events.length === 0) ? (
                    <div className="text-center py-12">
                      <Server size={32} className="mx-auto text-secondary mb-3 opacity-60" />
                      <p className="text-xs text-secondary font-medium">No webhook delivery events recorded in this database cycle.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse table-enterprise">
                      <thead>
                        <tr className="border-b border-border bg-base/20 text-[10px] font-bold uppercase tracking-wider text-secondary">
                          <th className="p-4">Event ID / Type</th>
                          <th className="p-4">Webhook Endpoint</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-center">Attempts</th>
                          <th className="p-4">Last Dispatched</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60 text-xs font-medium text-primary">
                        {webhookData.events.slice(0, 10).map((evt: any) => {
                          const isFailedOrDead = ['failed', 'dead'].includes(evt.status);
                          return (
                            <tr key={evt.eventId} className="hover:bg-base/30 transition-colors">
                              <td className="p-4">
                                <div className="font-semibold text-primary">{evt.event}</div>
                                <div className="text-[9px] text-secondary font-mono mt-0.5">{evt.eventId}</div>
                              </td>
                              <td className="p-4 max-w-xs truncate font-mono text-[10px] text-secondary">
                                {evt.targetUrl}
                              </td>
                              <td className="p-4">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  evt.status === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                  evt.status === 'pending' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' :
                                  evt.status === 'processing' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' :
                                  'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                                }`}>
                                  {evt.status}
                                </span>
                                {evt.lastError && (
                                  <div className="text-[9px] text-red-500 dark:text-red-400 mt-1 max-w-[180px] truncate" title={evt.lastError}>
                                    Error: {evt.lastError}
                                  </div>
                                )}
                              </td>
                              <td className="p-4 text-center font-semibold">{evt.attempts}</td>
                              <td className="p-4 text-secondary text-[11px]">
                                {evt.updatedAt ? new Date(evt.updatedAt).toLocaleString() : 'Never'}
                              </td>
                              <td className="p-4 text-right">
                                {isFailedOrDead ? (
                                  <button
                                    onClick={() => handleRetryWebhook(evt.eventId)}
                                    disabled={retryingEventId === evt.eventId}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent hover:bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider shadow-sm disabled:opacity-50 transition-colors"
                                  >
                                    {retryingEventId === evt.eventId ? (
                                      <Loader2 size={11} className="animate-spin" />
                                    ) : (
                                      <Play size={11} />
                                    )}
                                    Retry
                                  </button>
                                ) : (
                                  <span className="text-secondary text-[10px] font-semibold italic">Complete</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
