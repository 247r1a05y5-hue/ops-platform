/**
 * CRM Mock Data — Future-Ready Architecture
 *
 * These records are isolated here so that backend integration
 * requires only changing the import / data-source function,
 * not the consuming components.
 */

export interface RecentlyViewedLead {
  id: string;
  name: string;
  company: string;
  stage: string;
  value: string;
  viewedAt: string; // ISO timestamp
}

export interface PinnedLead {
  id: string;
  name: string;
  company: string;
  stage: string;
  value: string;
  pinnedAt: string;
}

export interface KeyboardShortcut {
  key: string;
  description: string;
  group: 'Navigation' | 'Actions' | 'Views';
}

// ---------------------------------------------------------------------------
// Recently Viewed Leads (frontend-only, session-scoped) - Cleaned for policy
// ---------------------------------------------------------------------------
export const RECENTLY_VIEWED_LEADS: RecentlyViewedLead[] = [];

// ---------------------------------------------------------------------------
// Pinned Leads (frontend-only, user-preference scoped) - Cleaned for policy
// ---------------------------------------------------------------------------
export const PINNED_LEADS: PinnedLead[] = [];

// ---------------------------------------------------------------------------
// Keyboard Shortcuts Reference
// ---------------------------------------------------------------------------
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'N', description: 'New Lead', group: 'Actions' },
  { key: 'B', description: 'Board View', group: 'Views' },
  { key: 'L', description: 'List View', group: 'Views' },
  { key: 'F', description: 'Toggle Funnel', group: 'Views' },
  { key: '/', description: 'Focus Search', group: 'Navigation' },
  { key: 'Esc', description: 'Close Panel', group: 'Navigation' },
];
