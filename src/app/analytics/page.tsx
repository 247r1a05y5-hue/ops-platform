'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUI } from '@/context/UIContext';
import { Download, TrendingUp, CheckCircle, Target, BarChart3, Users, Filter, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Analytics() {
  const { showToast } = useUI();
  const [isExporting, setIsExporting] = useState(false);
  const [activePeriod, setActivePeriod] = useState('month');

  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const ICON_MAP: Record<string, any> = { CheckCircle, Target, TrendingUp, Users };

  const fetchAnalytics = useCallback(async (period: string) => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${period}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (data.success) setAnalyticsData(data);
    } catch (err) {
      console.error('Analytics fetch failed:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(activePeriod); }, [activePeriod, fetchAnalytics]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/export/csv?type=leads', { credentials: 'include' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'leads_export.csv'; a.click();
        URL.revokeObjectURL(url);
        showToast('Analytics report exported', 'success');
      }
    } catch { showToast('Export failed', 'error'); }
    finally { setIsExporting(false); }
  };

  const kpiData   = (analyticsData?.kpiData ?? []).map((k: any) => ({
    ...k, icon: ICON_MAP[k.icon] ?? CheckCircle,
  }));
  const taskData        = analyticsData?.taskData        ?? [];
  const leadData        = analyticsData?.leadData        ?? [];
  const employees       = analyticsData?.employees       ?? [];
  const invoiceSummary  = analyticsData?.invoiceSummary  ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-8 lg:p-10 bg-base text-primary transition-colors min-h-screen">
      {analyticsLoading && <div className="flex items-center justify-center h-24"><Loader2 size={24} className="animate-spin text-accent" /></div>}
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-primary">Analytics & Reports</h1>
          <p className="text-secondary text-sm font-medium">Monitor team performance, lead conversion, and revenue metrics.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-surface border border-border rounded-xl p-1 shadow-inner">
              {['week', 'month', 'quarter'].map(p => (
                  <button
                    key={p}
                    onClick={() => { setActivePeriod(p); showToast(`Viewing: ${p}`, 'info'); }}
                    className={`px-6 py-2 rounded-lg text-sm font-semibold capitalize transition-all duration-200 ${activePeriod === p ? 'bg-base text-accent shadow-sm border border-border/50' : 'text-secondary hover:text-primary hover:bg-base/30'}`}
                  >
                    {p}
                  </button>
              ))}
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold shadow-[0_4px_14px_rgba(99,102,241,0.2)] hover:bg-indigo-600 transition-all disabled:opacity-70"
          >
            {isExporting ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Download size={18} />}
            Export Report
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <AnimatePresence mode="wait">
          {kpiData.map((kpi: any, i: number) => (
            <motion.div 
              key={`${activePeriod}-${i}`} 
              initial={{opacity:0, y:10}} 
              animate={{opacity:1, y:0}} 
              exit={{opacity:0, y:-10}}
              transition={{duration: 0.2, delay: i * 0.05}} 
              className="p-6 rounded-2xl border border-border bg-surface shadow-sm hover:shadow-md hover:border-accent/40 transition-all"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest">{kpi.title}</h3>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.color} bg-current/10`}>
                  <kpi.icon size={14} className={kpi.color} />
                </div>
              </div>
              <div className="flex items-end gap-3 mb-4">
                <span className="text-2xl font-bold tracking-tight text-primary">{kpi.value}</span>
                <span className={`text-[11px] font-bold mb-1 ${kpi.change.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{kpi.change}</span>
              </div>
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <motion.div
                  initial={{width: 0}}
                  animate={{width: `${kpi.bar}%`}}
                  transition={{delay: 0.2, duration: 0.8, ease: 'easeOut'}}
                  className={`h-full rounded-full ${kpi.color.replace('text-', 'bg-')}`}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        
        {/* Task Breakdown */}
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b border-border pb-4">
            <CheckCircle size={18} className="text-emerald-500" />
            <h2 className="text-base font-bold text-primary">Task Breakdown</h2>
          </div>
          <div className="flex flex-col gap-4">
            {taskData.map((item: any, i: number) => (
              <div key={i} className="group">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                    <span className="text-xs font-semibold text-secondary group-hover:text-primary transition-colors">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-primary">{item.count}</span>
                </div>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                  <motion.div
                    initial={{width: 0}}
                    animate={{width: `${item.pct}%`}}
                    transition={{delay: i * 0.05 + 0.1, duration: 0.6, ease: 'easeOut'}}
                    className={`h-full rounded-full ${item.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lead Pipeline Funnel */}
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b border-border pb-4">
            <Target size={18} className="text-blue-500" />
            <h2 className="text-base font-bold text-primary">Lead Pipeline</h2>
          </div>
          <div className="flex flex-col gap-4">
            {leadData.map((item: any, i: number) => (
              <div key={i} className="group">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                    <span className="text-xs font-semibold text-secondary group-hover:text-primary transition-colors">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-primary">{item.count}</span>
                </div>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                  <motion.div
                    initial={{width: 0}}
                    animate={{width: `${item.pct}%`}}
                    transition={{delay: i * 0.05 + 0.1, duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${item.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b border-border pb-4">
            <BarChart3 size={18} className="text-orange-500" />
            <h2 className="text-base font-bold text-primary">Invoice Summary</h2>
          </div>
          <div className="flex flex-col gap-4">
            {[
              { label: 'Total Invoiced', value: invoiceSummary?.total   ?? (analyticsLoading ? '...' : '—'), color: 'text-primary' },
              { label: 'Collected',      value: invoiceSummary?.paid    ?? (analyticsLoading ? '...' : '—'), color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Pending',        value: invoiceSummary?.pending ?? (analyticsLoading ? '...' : '—'), color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Overdue',        value: invoiceSummary?.overdue ?? (analyticsLoading ? '...' : '—'), color: 'text-red-600 dark:text-red-400' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
                <span className="text-xs font-semibold text-secondary">{row.label}</span>
                <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Employee Performance Table */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center bg-base/30">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-purple-500" />
            <h2 className="text-base font-bold text-primary">Employee Performance</h2>
          </div>
          <div className="flex gap-3">
            <button onClick={() => showToast('Applying filters...', 'info')} className="flex items-center gap-2 px-4 py-1.5 border border-border rounded-lg text-xs font-semibold text-secondary hover:text-primary hover:bg-base transition-colors">
              <Filter size={14} /> Filter
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-1.5 border border-border rounded-lg text-xs font-semibold text-secondary hover:text-primary hover:bg-base transition-colors">
              <Download size={14} /> Export
            </button>
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b border-border bg-base">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Total Tasks</th>
              <th className="px-6 py-4">Completed</th>
              <th className="px-6 py-4">Completion Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.map((emp: any, i: number) => (
              <tr key={i} className="hover:bg-base/50 transition-colors group cursor-pointer" onClick={() => showToast(`Viewing details for ${emp.name}`, 'info')}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
                      {emp.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <span className="font-bold text-xs text-primary group-hover:text-accent transition-colors">{emp.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs text-secondary font-medium">{emp.role}</td>
                <td className="px-6 py-4 text-xs font-bold text-primary">{emp.tasks}</td>
                <td className="px-6 py-4 text-xs font-bold text-emerald-600 dark:text-emerald-400">{emp.completed}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div
                        initial={{width:0}}
                        animate={{width: `${emp.pct}%`}}
                        transition={{delay: i * 0.1 + 0.3, duration: 0.6}}
                        className={`h-full rounded-full ${emp.pct >= 80 ? 'bg-emerald-500' : emp.pct >= 60 ? 'bg-blue-500' : 'bg-orange-500'}`}
                      />
                    </div>
                    <span className={`text-[11px] font-bold ${emp.pct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : emp.pct >= 60 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>{emp.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
