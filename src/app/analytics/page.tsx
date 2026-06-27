'use client';
import { useState, useEffect, useCallback } from 'react';
import { useUI } from '@/context/UIContext';
import {
  Download, TrendingUp, CheckCircle, Target, BarChart3,
  Users, Loader2, AlertCircle, RefreshCw, ChevronUp, ChevronDown, ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Skeleton ────────────────────────────────────────────────────────────────
const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`bg-gradient-to-r from-base via-surface to-base bg-[length:200%_100%] animate-[shimmer_1.5s_infinite] rounded-xl ${className}`} />
);

// ─── KPI Card ────────────────────────────────────────────────────────────────
const KPICard = ({ kpi, index }: { kpi: any; index: number }) => {
  const IconComp = kpi.icon;
  const isUp = kpi.change?.startsWith('+');
  return (
    <motion.div
      key={kpi.title}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, delay: index * 0.06 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm hover:shadow-md hover:border-accent/30 transition-all group"
    >
      {/* Decorative glow */}
      <div className={`absolute top-0 right-0 w-20 h-20 rounded-full opacity-10 blur-2xl group-hover:opacity-20 transition-opacity ${kpi.glowColor}`} />

      <div className="flex items-center justify-between mb-5">
        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{kpi.title}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kpi.iconBg}`}>
          <IconComp size={15} className={kpi.color} />
        </div>
      </div>

      <div className="flex items-end gap-3 mb-5">
        <span className="text-3xl font-black tracking-tight text-primary">{kpi.value}</span>
        <span className={`flex items-center gap-0.5 text-[11px] font-bold mb-0.5 ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
          {isUp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {kpi.change}
        </span>
      </div>

      <div className="w-full h-1.5 bg-border/60 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(4, kpi.bar)}%` }}
          transition={{ delay: index * 0.06 + 0.3, duration: 0.9, ease: 'easeOut' }}
          className={`h-full rounded-full ${kpi.barColor}`}
        />
      </div>
    </motion.div>
  );
};

// ─── Bar Row ─────────────────────────────────────────────────────────────────
const BarRow = ({ item, index, max }: { item: any; index: number; max: number }) => (
  <div className="group">
    <div className="flex justify-between items-center mb-1.5">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${item.color} shrink-0`} />
        <span className="text-xs font-semibold text-secondary group-hover:text-primary transition-colors">{item.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-primary">{item.count}</span>
        <span className="text-[10px] text-tertiary font-medium w-9 text-right">{item.pct}%</span>
      </div>
    </div>
    <div className="w-full h-2 bg-border/40 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${max > 0 ? (item.count / max) * 100 : item.pct}%` }}
        transition={{ delay: index * 0.07 + 0.15, duration: 0.7, ease: 'easeOut' }}
        className={`h-full rounded-full bg-gradient-to-r ${item.gradient || 'from-accent to-indigo-400'}`}
      />
    </div>
  </div>
);

// ─── Section Card ────────────────────────────────────────────────────────────
const SectionCard = ({ title, icon: Icon, iconColor, children, count }: {
  title: string; icon: any; iconColor: string; children: React.ReactNode; count?: number;
}) => (
  <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
    <div className="flex items-center justify-between p-5 border-b border-border bg-base/20">
      <div className="flex items-center gap-2.5">
        <Icon size={16} className={iconColor} />
        <h2 className="text-sm font-bold text-primary">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="text-[10px] font-black text-secondary bg-base border border-border px-2 py-0.5 rounded-full">{count} total</span>
      )}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Analytics() {
  const { showToast } = useUI();
  const [isExporting, setIsExporting] = useState(false);
  const [activePeriod, setActivePeriod] = useState('month');
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<'name' | 'tasks' | 'completed' | 'pct'>('pct');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const ICON_MAP: Record<string, any> = { CheckCircle, Target, TrendingUp, Users };
  const GLOW_MAP: Record<string, string> = {
    'text-emerald-500': 'bg-emerald-500',
    'text-blue-500': 'bg-blue-500',
    'text-orange-500': 'bg-orange-500',
    'text-purple-500': 'bg-purple-500',
    'text-accent': 'bg-accent',
  };
  const BAR_COLOR_MAP: Record<string, string> = {
    'text-emerald-500': 'bg-emerald-500',
    'text-blue-500': 'bg-blue-500',
    'text-orange-500': 'bg-orange-500',
    'text-purple-500': 'bg-purple-500',
    'text-accent': 'bg-accent',
  };
  const ICON_BG_MAP: Record<string, string> = {
    'text-emerald-500': 'bg-emerald-500/10',
    'text-blue-500': 'bg-blue-500/10',
    'text-orange-500': 'bg-orange-500/10',
    'text-purple-500': 'bg-purple-500/10',
    'text-accent': 'bg-accent/10',
  };

  const fetchAnalytics = useCallback(async (period: string) => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(`/api/analytics?period=${period}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setAnalyticsData(data);
        setLastRefreshed(new Date());
      } else {
        setAnalyticsError(data.error || 'Analytics API returned an error.');
      }
    } catch (err: any) {
      setAnalyticsError(err.message || 'Failed to reach analytics endpoint.');
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
      } else {
        showToast('Export failed', 'error');
      }
    } catch { showToast('Export failed', 'error'); }
    finally { setIsExporting(false); }
  };

  const kpiData = (analyticsData?.kpiData ?? []).map((k: any) => ({
    ...k,
    icon: ICON_MAP[k.icon] ?? CheckCircle,
    glowColor: GLOW_MAP[k.color] ?? 'bg-accent',
    barColor: BAR_COLOR_MAP[k.color] ?? 'bg-accent',
    iconBg: ICON_BG_MAP[k.color] ?? 'bg-accent/10',
  }));
  const taskData = analyticsData?.taskData ?? [];
  const leadData = analyticsData?.leadData ?? [];
  const employees = analyticsData?.employees ?? [];
  const invoiceSummary = analyticsData?.invoiceSummary ?? null;

  const TASK_GRADIENT_MAP = ['from-emerald-500 to-teal-400', 'from-blue-500 to-indigo-400', 'from-orange-500 to-amber-400', 'from-red-500 to-rose-400', 'from-purple-500 to-violet-400'];
  const LEAD_GRADIENT_MAP = ['from-blue-500 to-cyan-400', 'from-indigo-500 to-purple-400', 'from-emerald-500 to-teal-400', 'from-amber-500 to-orange-400', 'from-rose-500 to-red-400', 'from-violet-500 to-purple-400'];

  const taskDataWithGradients = taskData.map((t: any, i: number) => ({ ...t, gradient: TASK_GRADIENT_MAP[i % TASK_GRADIENT_MAP.length] }));
  const leadDataWithGradients = leadData.map((l: any, i: number) => ({ ...l, gradient: LEAD_GRADIENT_MAP[i % LEAD_GRADIENT_MAP.length] }));
  const taskMax = taskData.reduce((m: number, t: any) => Math.max(m, t.count), 0);
  const leadMax = leadData.reduce((m: number, l: any) => Math.max(m, l.count), 0);

  // Sort employees
  const sortedEmployees = [...employees].sort((a: any, b: any) => {
    const val = (e: any) => sortCol === 'name' ? e.name : sortCol === 'tasks' ? e.tasks : sortCol === 'completed' ? e.completed : e.pct;
    const av = val(a), bv = val(b);
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <div className="w-3 h-3" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  };

  const periods = ['week', 'month', 'quarter'];

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10 bg-base text-primary min-h-screen">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Live Analytics</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-1 text-primary">Analytics & Reports</h1>
          <p className="text-sm text-secondary font-medium">
            Team performance, lead conversion, and revenue metrics.
            {lastRefreshed && (
              <span className="text-tertiary ml-2">· Refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period Selector */}
          <div className="relative flex bg-surface border border-border rounded-xl p-1 shadow-inner">
            {/* Sliding indicator */}
            <motion.div
              className="absolute top-1 bottom-1 bg-base border border-border/50 rounded-lg shadow-sm"
              style={{ width: `calc(${100 / periods.length}% - 2px)` }}
              animate={{ x: `calc(${periods.indexOf(activePeriod) * 100}% + ${periods.indexOf(activePeriod) * 2}px)` }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
            {periods.map(p => (
              <button
                key={p}
                onClick={() => { setActivePeriod(p); }}
                className={`relative z-10 px-5 py-2 rounded-lg text-xs font-bold capitalize transition-colors duration-150 ${activePeriod === p ? 'text-accent' : 'text-secondary hover:text-primary'}`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchAnalytics(activePeriod)}
            disabled={analyticsLoading}
            className="p-2.5 rounded-xl border border-border bg-surface text-secondary hover:text-primary hover:border-accent/30 transition-all"
            title="Refresh analytics"
          >
            <RefreshCw size={15} className={analyticsLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold shadow-[0_4px_14px_rgba(99,102,241,0.25)] hover:bg-indigo-600 transition-all disabled:opacity-60 active:scale-[0.98]"
          >
            {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export
          </button>
        </div>
      </div>

      {/* ── Error State ── */}
      {analyticsError && !analyticsLoading && (
        <div className="mb-8 flex items-center justify-between p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} />
            <div>
              <div className="text-sm font-bold">Analytics unavailable</div>
              <div className="text-xs opacity-80 mt-0.5">{analyticsError}</div>
            </div>
          </div>
          <button onClick={() => fetchAnalytics(activePeriod)} className="text-xs font-bold px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl border border-red-500/20 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <AnimatePresence mode="wait">
          {analyticsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-border bg-surface p-6 space-y-4">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-8 rounded-xl" />
                </div>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-1.5 w-full" />
              </motion.div>
            ))
            : kpiData.length === 0 && !analyticsError
              ? <motion.div key="empty-kpi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-4 py-16 text-center text-secondary text-sm border border-dashed border-border rounded-2xl bg-base/30">
                  <BarChart3 size={28} className="mx-auto mb-3 text-secondary/40" />
                  <div className="font-bold text-primary mb-1">No analytics data</div>
                  <div className="text-xs">Start using the platform to generate metrics for this period.</div>
                </motion.div>
              : kpiData.map((kpi: any, i: number) => <KPICard key={`${activePeriod}-${i}`} kpi={kpi} index={i} />)
          }
        </AnimatePresence>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Task Breakdown */}
        <SectionCard title="Task Breakdown" icon={CheckCircle} iconColor="text-emerald-500" count={analyticsLoading ? undefined : taskData.reduce((s: number, t: any) => s + t.count, 0)}>
          {analyticsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-32" /><Skeleton className="h-2 w-full" /></div>)}
            </div>
          ) : taskData.length === 0 ? (
            <div className="py-10 text-center text-xs text-secondary/60 italic">
              <CheckCircle size={22} className="mx-auto mb-2 text-secondary/30" />
              No task data for this period.
            </div>
          ) : (
            <div className="space-y-4">
              {taskDataWithGradients.map((item: any, i: number) => <BarRow key={i} item={item} index={i} max={taskMax} />)}
            </div>
          )}
        </SectionCard>

        {/* Lead Pipeline */}
        <SectionCard title="Lead Pipeline" icon={Target} iconColor="text-blue-500" count={analyticsLoading ? undefined : leadData.reduce((s: number, l: any) => s + l.count, 0)}>
          {analyticsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-2 w-full" /></div>)}
            </div>
          ) : leadData.length === 0 ? (
            <div className="py-10 text-center text-xs text-secondary/60 italic">
              <Target size={22} className="mx-auto mb-2 text-secondary/30" />
              No leads in pipeline.
            </div>
          ) : (
            <div className="space-y-4">
              {leadDataWithGradients.map((item: any, i: number) => <BarRow key={i} item={item} index={i} max={leadMax} />)}
            </div>
          )}
        </SectionCard>

        {/* Invoice Summary */}
        <SectionCard title="Invoice Summary" icon={BarChart3} iconColor="text-orange-500">
          {analyticsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="flex justify-between py-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div>)}
            </div>
          ) : !invoiceSummary ? (
            <div className="py-10 text-center text-xs text-secondary/60 italic">
              <BarChart3 size={22} className="mx-auto mb-2 text-secondary/30" />
              No invoice data available.
            </div>
          ) : (
            <div className="space-y-1">
              {[
                { label: 'Total Invoiced', value: invoiceSummary.total ?? '—', color: 'text-primary', bg: '' },
                { label: 'Collected', value: invoiceSummary.paid ?? '—', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5' },
                { label: 'Pending', value: invoiceSummary.pending ?? '—', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/5' },
                { label: 'Overdue', value: invoiceSummary.overdue ?? '—', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/5' },
              ].map((row, i) => (
                <div key={i} className={`flex justify-between items-center py-3 px-3 rounded-xl ${row.bg} ${i < 3 ? 'border-b border-border/30' : ''}`}>
                  <span className="text-xs font-semibold text-secondary">{row.label}</span>
                  <span className={`text-sm font-black ${row.color}`}>{row.value}</span>
                </div>
              ))}
              {invoiceSummary.total && invoiceSummary.paid && (
                <div className="pt-3">
                  <div className="flex justify-between text-[10px] font-bold text-secondary uppercase mb-1.5">
                    <span>Collection Rate</span>
                    <span className="text-emerald-500">
                      {invoiceSummary.total && invoiceSummary.paid
                        ? `${Math.round((parseFloat(String(invoiceSummary.paid).replace(/[^0-9.]/g, '')) / parseFloat(String(invoiceSummary.total).replace(/[^0-9.]/g, ''))) * 100) || 0}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-border/40 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${invoiceSummary.total && invoiceSummary.paid
                          ? Math.min(100, Math.round((parseFloat(String(invoiceSummary.paid).replace(/[^0-9.]/g, '')) / parseFloat(String(invoiceSummary.total).replace(/[^0-9.]/g, ''))) * 100))
                          : 0}%`
                      }}
                      transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Employee Performance Table ── */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-base/20">
          <div className="flex items-center gap-2.5">
            <Users size={16} className="text-purple-500" />
            <h2 className="text-sm font-bold text-primary">Employee Performance</h2>
            {!analyticsLoading && employees.length > 0 && (
              <span className="text-[10px] font-black text-secondary bg-base border border-border px-2 py-0.5 rounded-full">{employees.length} members</span>
            )}
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-secondary hover:text-primary hover:border-accent/30 hover:bg-base/30 transition-all self-start sm:self-auto"
          >
            <Download size={13} />
            Export CSV
            <ArrowUpRight size={12} className="opacity-50" />
          </button>
        </div>

        {analyticsLoading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10" />
                <div className="flex items-center gap-2 w-32">
                  <Skeleton className="flex-1 h-1.5 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="py-20 text-center">
            <Users size={32} className="mx-auto mb-3 text-secondary/30" />
            <div className="text-sm font-bold text-primary mb-1">No performance data</div>
            <div className="text-xs text-secondary">Assign tasks to team members to generate performance reports.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-border bg-base/30">
                <tr>
                  {[
                    { label: 'Employee', col: 'name' as const },
                    { label: 'Total Tasks', col: 'tasks' as const },
                    { label: 'Completed', col: 'completed' as const },
                    { label: 'Completion Rate', col: 'pct' as const },
                  ].map(({ label, col }) => (
                    <th
                      key={col}
                      onClick={() => toggleSort(col)}
                      className="px-6 py-3.5 text-[10px] font-bold text-secondary uppercase tracking-widest cursor-pointer hover:text-primary transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        {label}
                        <SortIcon col={col} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sortedEmployees.map((emp: any, i: number) => {
                  const avatarColors = [
                    'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
                    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                    'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                    'bg-rose-500/15 text-rose-600 dark:text-rose-400',
                    'bg-purple-500/15 text-purple-600 dark:text-purple-400',
                  ];
                  const avatarColor = avatarColors[i % avatarColors.length];
                  const pctColor = emp.pct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : emp.pct >= 60 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400';
                  const barColor = emp.pct >= 80 ? 'from-emerald-500 to-teal-400' : emp.pct >= 60 ? 'from-blue-500 to-indigo-400' : 'from-orange-500 to-amber-400';
                  const initials = emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

                  return (
                    <tr key={i} className="hover:bg-base/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border border-border/50 ${avatarColor}`}>
                            {initials}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-primary group-hover:text-accent transition-colors">{emp.name}</div>
                            <div className="text-[10px] text-secondary font-medium">{emp.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-primary">{emp.tasks}</td>
                      <td className="px-6 py-4 text-xs font-bold text-emerald-600 dark:text-emerald-400">{emp.completed}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 min-w-[120px]">
                          <div className="flex-1 h-1.5 bg-border/40 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${emp.pct}%` }}
                              transition={{ delay: i * 0.08 + 0.4, duration: 0.7, ease: 'easeOut' }}
                              className={`h-full rounded-full bg-gradient-to-r ${barColor}`}
                            />
                          </div>
                          <span className={`text-[11px] font-black w-9 text-right ${pctColor}`}>{emp.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
