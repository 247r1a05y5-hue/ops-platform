'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Settings,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  Edit2,
  Power,
  Server,
  Activity,
  X,
  UserCheck,
  UserMinus,
  Mail,
  AlertCircle,
  Clock,
  Shield,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import { useSocket } from '@/hooks/useSocket';

type UserObj = {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastLogin?: string;
  suspended: boolean;
  isOnline?: boolean;
};

type AuditLog = {
  _id: string;
  name: string;
  userEmail: string;
  actionType: string;
  module: string;
  description: string;
  timestamp: string;
};

type HealthStatus = {
  status: string;
  timestamp: string;
  services: {
    database: { status: string; details: string };
    whatsapp: { status: string };
    paymentGateway: { status: string };
    emailService: { status: string };
  };
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'system'>('users');
  const [users, setUsers] = useState<UserObj[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userError, setUserError] = useState('');

  // Real-time Presence
  const { socket } = useSocket();
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;
    const onChatEvent = (payload: any) => {
      if (payload.type === 'presence_snapshot') {
        setOnlineUserIds(new Set<string>(payload.onlineUserIds ?? []));
      } else if (payload.type === 'presence_change') {
        const { userId, isOnline } = payload;
        setOnlineUserIds(prev => {
          const next = new Set(prev);
          if (isOnline) {
            next.add(userId);
          } else {
            next.delete(userId);
          }
          return next;
        });
      }
    };
    socket.on('chat_event', onChatEvent);
    return () => {
      socket.off('chat_event', onChatEvent);
    };
  }, [socket]);

  const usersWithRealtimePresence = useMemo(() => {
    return users.map(u => ({
      ...u,
      isOnline: onlineUserIds.has(u._id) || u.isOnline
    }));
  }, [users, onlineUserIds]);

  // Collapse states for widgets
  const [isMaintenanceCollapsed, setIsMaintenanceCollapsed] = useState(false);
  const [isCacheCollapsed, setIsCacheCollapsed] = useState(false);
  const [isAuditCollapsed, setIsAuditCollapsed] = useState(false);
  const [isHealthCollapsed, setIsHealthCollapsed] = useState(false);

  // Maintenance & System state
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheMessage, setCacheMessage] = useState('');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Quick Audit Search
  const [auditQuery, setAuditQuery] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // User Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserObj | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('User');
  const [formSuspended, setFormSuspended] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUserError('');
    try {
      const q = new URLSearchParams({
        search: userSearch,
        role: userRoleFilter
      });
      const res = await fetch(`/api/admin/users?${q}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error((await res.json()).error || 'Failed to fetch users');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setUserError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  }, [userSearch, userRoleFilter]);

  // Fetch Maintenance Mode status
  const fetchMaintenance = async () => {
    setMaintenanceLoading(true);
    try {
      const res = await fetch('/api/admin/maintenance', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceEnabled(data.enabled);
      }
    } catch (err) {
      console.error('Error fetching maintenance mode:', err);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  // Toggle Maintenance Mode
  const toggleMaintenance = async () => {
    const nextState = !maintenanceEnabled;
    if (!confirm(`Are you sure you want to turn maintenance mode ${nextState ? 'ON' : 'OFF'}?\n\nNon-admin accounts will be blocked from accessing the system.`)) {
      return;
    }
    setMaintenanceLoading(true);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceEnabled(data.enabled);
      } else {
        alert((await res.json()).error || 'Failed to toggle maintenance mode');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  // Clear Cache
  const handleClearCache = async () => {
    setCacheClearing(true);
    setCacheMessage('');
    try {
      const res = await fetch('/api/admin/cache', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setCacheMessage('System cache cleared successfully!');
      } else {
        setCacheMessage(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setCacheMessage(`Error: ${err.message}`);
    } finally {
      setCacheClearing(false);
    }
  };

  // Fetch System Health
  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' });
      if (res.ok) {
        setHealth(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHealthLoading(false);
    }
  };

  // Search Audit Logs
  const handleSearchAudit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoadingAudit(true);
    try {
      const q = new URLSearchParams({ search: auditQuery, limit: '5' });
      const res = await fetch(`/api/admin/audit?${q}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else {
      fetchMaintenance();
      fetchHealth();
      handleSearchAudit();
    }
  }, [activeTab, fetchUsers]);

  // Open modals
  const openAddModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('User');
    setFormSuspended(false);
    setFormError('');
    setShowAddModal(true);
  };

  const openEditModal = (user: UserObj) => {
    setSelectedUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword('');
    setFormRole(user.role);
    setFormSuspended(user.suspended);
    setFormError('');
    setShowEditModal(true);
  };

  // Add User submit
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
          suspended: formSuspended
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      setShowAddModal(false);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Edit User submit
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedUser._id,
          name: formName,
          email: formEmail,
          role: formRole,
          suspended: formSuspended,
          ...(formPassword && { password: formPassword })
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');
      setShowEditModal(false);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fmt = (ts?: string) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6 max-w-full min-h-screen bg-base-100 text-primary">
      {/* Title */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
          <Settings className="w-6 h-6 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Admin Controls</h1>
          <p className="text-sm text-secondary">Manage workspace users, system configurations, and platform health.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'users'
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Users className="w-4 h-4" />
          Workspace Users
        </button>
        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'system'
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Server className="w-4 h-4" />
          System Settings & Health
        </button>
      </div>

      {/* Content: Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-surface border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary" />
                <input
                  type="text"
                  placeholder="Search name or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="input-enterprise w-full pl-9 pr-3 py-2 text-sm"
                />
              </div>

              {/* Role Select */}
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="input-enterprise px-3 py-2 text-sm max-w-xs"
              >
                <option value="">All Roles</option>
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
                <option value="Staff">Employee</option>
                <option value="User">Marketing Rep</option>
              </select>

              <button
                onClick={fetchUsers}
                className="p-2 rounded-lg border border-border bg-base hover:bg-surface text-secondary transition-colors"
                title="Refresh user list"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={openAddModal}
              className="btn-enterprise-primary flex items-center gap-1.5 px-4 py-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Create User
            </button>
          </div>

          {userError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
              <AlertCircle className="w-4 h-4" />
              {userError}
            </div>
          )}

          {/* User Table Card */}
          <div className="card-enterprise p-0 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-base text-secondary font-medium">
                    <th className="px-4 py-2.5">User</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5">Last Login</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loadingUsers ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="px-4 py-3"><div className="h-4 bg-base rounded w-36" /></td>
                        <td className="px-4 py-3"><div className="h-4 bg-base rounded w-16" /></td>
                        <td className="px-4 py-3"><div className="h-4 bg-base rounded w-24" /></td>
                        <td className="px-4 py-3"><div className="h-4 bg-base rounded w-24" /></td>
                        <td className="px-4 py-3"><div className="h-4 bg-base rounded w-12" /></td>
                        <td className="px-4 py-3"><div className="h-4 bg-base rounded w-16 ml-auto" /></td>
                      </tr>
                    ))
                  ) : usersWithRealtimePresence.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-secondary">
                        No workspace users found matching the filter.
                      </td>
                    </tr>
                  ) : (
                    usersWithRealtimePresence.map((u) => (
                      <tr key={u._id} className="hover:bg-base/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-primary">{u.name}</div>
                          <div className="text-xs text-secondary flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {u.email}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-secondary">{fmt(u.createdAt)}</td>
                        <td className="px-4 py-3 text-xs text-secondary">{fmt(u.lastLogin)}</td>
                        <td className="px-4 py-3">
                          {u.suspended ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20">
                              <UserMinus className="w-3.5 h-3.5" /> Suspended
                            </span>
                          ) : u.isOnline ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 animate-pulse">
                              <UserCheck className="w-3.5 h-3.5" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-500/10 px-2 py-1 rounded-full border border-slate-500/20">
                              <UserMinus className="w-3.5 h-3.5" /> Not Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(u)}
                              className="btn-enterprise-secondary p-1.5"
                              title="Edit user details"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u._id)}
                              className="btn-enterprise-secondary p-1.5 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20"
                              title="Delete user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Content: System Settings & Health Tab */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Global Settings Card */}
            <div className="card-enterprise p-0 overflow-hidden shadow-sm">
              <div 
                className="flex justify-between items-center p-5 md:p-6 border-b border-border bg-base/30 cursor-pointer select-none hover:bg-base/20 transition-colors"
                onClick={() => setIsMaintenanceCollapsed(!isMaintenanceCollapsed)}
              >
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-500" />
                  Global Configurations
                </h3>
                <ChevronDown size={18} className={`text-secondary transition-transform duration-200 ${isMaintenanceCollapsed ? '-rotate-90' : ''}`} />
              </div>
              <motion.div
                initial={false}
                animate={{ height: isMaintenanceCollapsed ? 0 : 'auto', opacity: isMaintenanceCollapsed ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-6 divide-y divide-border/50">
                  {/* Maintenance Mode Row */}
                  <div className="py-4 first:pt-0 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-primary">System Maintenance Mode</div>
                      <div className="text-xs text-secondary mt-0.5">
                        Prevents non-admin accounts from loading any views, redirecting them to a splash page instantly.
                      </div>
                    </div>
                    <button
                      disabled={maintenanceLoading}
                      onClick={toggleMaintenance}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-98 ${
                        maintenanceEnabled
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-base border border-border hover:bg-surface text-primary'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {maintenanceEnabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>

                  {/* Cache Clearing Row */}
                  <div className="py-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-primary">Clear System Cache</div>
                      <div className="text-xs text-secondary mt-0.5">
                        Purge all server-side revalidations and force layout reload for all connected nodes.
                      </div>
                      {cacheMessage && (
                        <div className="text-xs font-semibold text-accent mt-2">{cacheMessage}</div>
                      )}
                    </div>
                    <button
                      disabled={cacheClearing}
                      onClick={handleClearCache}
                      className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 active:scale-98 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${cacheClearing ? 'animate-spin' : ''}`} />
                      Clear Cache
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Audit Log Query Card */}
            <div className="card-enterprise p-0 overflow-hidden shadow-sm">
              <div 
                className="flex justify-between items-center p-5 md:p-6 border-b border-border bg-base/30 cursor-pointer select-none hover:bg-base/20 transition-colors"
                onClick={() => setIsAuditCollapsed(!isAuditCollapsed)}
              >
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  Quick Audit Search
                </h3>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href="/admin/audit"
                    className="text-xs text-accent hover:underline flex items-center gap-1 mr-1"
                  >
                    Go to Full Logs &rarr;
                  </Link>
                  <ChevronDown size={18} className={`text-secondary transition-transform duration-200 ${isAuditCollapsed ? '-rotate-90' : ''}`} onClick={() => setIsAuditCollapsed(!isAuditCollapsed)} />
                </div>
              </div>
              <motion.div
                initial={false}
                animate={{ height: isAuditCollapsed ? 0 : 'auto', opacity: isAuditCollapsed ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-6">
                  <form onSubmit={handleSearchAudit} className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-secondary" />
                      <input
                        type="text"
                        placeholder="Search action, user email, module..."
                        value={auditQuery}
                        onChange={(e) => setAuditQuery(e.target.value)}
                        className="input-enterprise w-full pl-9 pr-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loadingAudit}
                      className="btn-enterprise-primary px-4 py-2 text-sm"
                    >
                      Run Query
                    </button>
                  </form>

                  {/* Logs Results */}
                  <div className="space-y-3">
                    {loadingAudit ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-12 bg-base rounded-lg animate-pulse" />
                      ))
                    ) : auditLogs.length === 0 ? (
                      <div className="text-sm text-secondary py-6 text-center font-medium">
                        No matching audit records found.
                      </div>
                    ) : (
                      <div className="border border-border/50 rounded-lg divide-y divide-border/50 overflow-hidden bg-base/10">
                        {auditLogs.map((log) => (
                          <div key={log._id} className="p-3 hover:bg-base/30 text-xs flex justify-between gap-4">
                            <div>
                              <div className="font-semibold text-primary flex items-center gap-2">
                                <span>{log.actionType}</span>
                                <span className="px-1.5 py-0.5 rounded bg-base border border-border/50 text-[10px] font-normal text-secondary">
                                  {log.module}
                                </span>
                              </div>
                              <div className="text-secondary mt-1">{log.description}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-medium text-secondary flex items-center gap-1.5 justify-end">
                                {(() => {
                                  const uMatch = usersWithRealtimePresence.find(u => u.name.toLowerCase() === log.name.toLowerCase());
                                  if (!uMatch) return null;
                                  return (
                                    <span
                                      title={uMatch.suspended ? 'Suspended' : uMatch.isOnline ? 'Online' : 'Offline'}
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        uMatch.suspended ? 'bg-red-500' : uMatch.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                      }`}
                                    />
                                  );
                                })()}
                                <span>{log.name}</span>
                              </div>
                              <div className="text-secondary/70 mt-1 flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" />
                                {fmt(log.timestamp)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Health Diagnostics Column */}
          <div className="lg:col-span-4">
            <div className="card-enterprise p-0 overflow-hidden shadow-sm sticky top-6">
              <div 
                className="flex justify-between items-center p-5 md:p-6 border-b border-border bg-base/30 cursor-pointer select-none hover:bg-base/20 transition-colors"
                onClick={() => setIsHealthCollapsed(!isHealthCollapsed)}
              >
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-500" />
                  System Health
                </h3>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={fetchHealth}
                    disabled={healthLoading}
                    className="p-1.5 rounded-lg border border-border bg-base hover:bg-surface text-secondary hover:text-primary transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <ChevronDown size={18} className={`text-secondary transition-transform duration-200 ${isHealthCollapsed ? '-rotate-90' : ''}`} onClick={() => setIsHealthCollapsed(!isHealthCollapsed)} />
                </div>
              </div>
              <motion.div
                initial={false}
                animate={{ height: isHealthCollapsed ? 0 : 'auto', opacity: isHealthCollapsed ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-6">
                  {healthLoading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-10 bg-base rounded animate-pulse" />
                      ))}
                    </div>
                  ) : health ? (
                    <div className="space-y-4 text-sm">
                      {/* Status Indicator */}
                      <div className="flex items-center gap-3 p-3 bg-base rounded-xl border border-border/50">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                        <div>
                          <div className="font-bold capitalize">{health.status}</div>
                          <div className="text-xs text-secondary">Checked {fmt(health.timestamp)}</div>
                        </div>
                      </div>

                      {/* Service breakdown */}
                      <div className="space-y-2">
                        {/* Database */}
                        <div className="flex items-center justify-between p-2 rounded hover:bg-base/30">
                          <div>
                            <div className="font-semibold">Database Connection</div>
                            <div className="text-xs text-secondary">{health.services.database.details}</div>
                          </div>
                          {health.services.database.status === 'healthy' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-semibold">OK</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 text-xs font-semibold">Fail</span>
                          )}
                        </div>

                        {/* Email Service */}
                        <div className="flex items-center justify-between p-2 rounded hover:bg-base/30">
                          <div>
                            <div className="font-semibold">SMTP Email Gateway</div>
                            <div className="text-xs text-secondary">Brevo Relay</div>
                          </div>
                          {health.services.emailService.status === 'configured' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-semibold">Active</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-semibold">Disabled</span>
                          )}
                        </div>

                        {/* WhatsApp */}
                        <div className="flex items-center justify-between p-2 rounded hover:bg-base/30">
                          <div>
                            <div className="font-semibold">WhatsApp Gateway</div>
                            <div className="text-xs text-secondary">Meta Cloud API</div>
                          </div>
                          {health.services.whatsapp.status === 'configured' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-semibold">Active</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-semibold">Disabled</span>
                          )}
                        </div>

                        {/* Payment */}
                        <div className="flex items-center justify-between p-2 rounded hover:bg-base/30">
                          <div>
                            <div className="font-semibold">Razorpay Integration</div>
                            <div className="text-xs text-secondary">Payment link creation</div>
                          </div>
                          {health.services.paymentGateway.status === 'configured' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-semibold">Active</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-semibold">Disabled</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-secondary text-center py-6">
                      Unable to parse health snapshot.
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create User */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-accent" />
                Create User Account
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-base text-secondary hover:text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                  placeholder="e.g. Vaishnavi Rathod"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                  placeholder="e.g. name@domain.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  System Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Staff">Employee</option>
                  <option value="User">Marketing Representative</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="suspended_add"
                  checked={formSuspended}
                  onChange={(e) => setFormSuspended(e.target.checked)}
                  className="w-4 h-4 accent-accent rounded border-border"
                />
                <label htmlFor="suspended_add" className="text-secondary font-medium select-none cursor-pointer">
                  Suspend user immediately
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-enterprise-secondary px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn-enterprise-primary px-4 py-2"
                >
                  {formSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-500" />
                Modify User Account
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded-lg hover:bg-base text-secondary hover:text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleEditUser} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  Reset Password <span className="text-secondary/70 font-normal lowercase">(leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                  placeholder="Enter new password to change"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-secondary mb-1">
                  System Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="input-enterprise w-full px-3 py-2 text-primary"
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Staff">Employee</option>
                  <option value="User">Marketing Representative</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="suspended_edit"
                  checked={formSuspended}
                  onChange={(e) => setFormSuspended(e.target.checked)}
                  className="w-4 h-4 accent-accent rounded border-border"
                />
                <label htmlFor="suspended_edit" className="text-secondary font-medium select-none cursor-pointer">
                  Deactivate / Suspend account access
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-enterprise-secondary px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn-enterprise-primary px-4 py-2"
                >
                  {formSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
