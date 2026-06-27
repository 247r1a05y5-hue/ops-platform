export interface QuickShortcut {
  name: string;
  description: string;
  actionKey: string;
}

export interface RecentApprovalLog {
  id: string;
  leadName: string;
  company: string;
  amount: string;
  approvedBy: string;
  timestamp: string;
}

export interface TeamHighlight {
  label: string;
  value: string;
  trend: string;
  type: 'success' | 'warning' | 'info' | 'default';
}

export const QUICK_SHORTCUTS: QuickShortcut[] = [
  { name: 'Broadcast Sync Notice', description: 'Alert all operational reps to sync regional caches.', actionKey: 'sync_notice' },
  { name: 'Personnel Audit Sync', description: 'Trigger deterministic recalculations for efficiency levels.', actionKey: 'audit_sync' },
  { name: 'Policy Override Lock', description: 'Force emergency strict mode for sensitive lead clearances.', actionKey: 'policy_lock' }
];

export const RECENT_APPROVALS_LOG: RecentApprovalLog[] = [
  { id: 'APP-9021', leadName: 'Acme Corp Portal', company: 'Acme Inc', amount: '₹2,50,000', approvedBy: 'Alex Mercer', timestamp: '2 hours ago' },
  { id: 'APP-8843', leadName: 'DevOps Node Egress', company: 'Cloudflare West', amount: '₹1,20,000', approvedBy: 'Sarah Jenkins', timestamp: '5 hours ago' }
];

export const TEAM_HIGHLIGHTS: TeamHighlight[] = [
  { label: 'Top Efficiency Yield', value: 'Sarah Jenkins (98%)', trend: 'Consistent high output', type: 'success' },
  { label: 'Highest Closed Deal', value: '₹5,00,000 (Acme Retainer)', trend: 'Leads Pipeline', type: 'info' },
  { label: 'Unresolved Alerts', value: '0 Pending Warnings', trend: 'Systems Clear', type: 'success' }
];
