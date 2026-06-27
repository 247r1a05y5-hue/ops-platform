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
// Recently Viewed Leads (frontend-only, session-scoped)
// ---------------------------------------------------------------------------
export const RECENTLY_VIEWED_LEADS: RecentlyViewedLead[] = [
  { id: '1', name: 'Sarah Jenkins', company: 'Acme Corp', stage: 'Qualified', value: '$25,000', viewedAt: '2026-06-27T10:15:00.000Z' },
  { id: '2', name: 'David Miller', company: 'Starlight Tech', stage: 'Negotiation', value: '$48,000', viewedAt: '2026-06-27T09:45:00.000Z' },
  { id: '3', name: 'Elena Rostova', company: 'Siberia Logistics', stage: 'Proposal', value: '$12,500', viewedAt: '2026-06-27T08:30:00.000Z' },
];

// ---------------------------------------------------------------------------
// Pinned Leads (frontend-only, user-preference scoped)
// ---------------------------------------------------------------------------
export const PINNED_LEADS: PinnedLead[] = [
  { id: '2', name: 'David Miller', company: 'Starlight Tech', stage: 'Negotiation', value: '$48,000', pinnedAt: '2026-06-27T09:00:00.000Z' },
  { id: '4', name: 'Marcus Aurelius', company: 'Rome Enterprises', stage: 'Closing', value: '$120,000', pinnedAt: '2026-06-27T09:05:00.000Z' },
];

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
