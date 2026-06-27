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

// Emptied to satisfy the critical future-ready policy (no fabricated dashboard values or mock statistics)
export const QUICK_SHORTCUTS: QuickShortcut[] = [];
export const RECENT_APPROVALS_LOG: RecentApprovalLog[] = [];
export const TEAM_HIGHLIGHTS: TeamHighlight[] = [];
