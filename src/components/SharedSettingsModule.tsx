'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, EyeOff, Eye, Save, User, Bell, Shield, Globe,
  Sliders, Sun, Moon
} from 'lucide-react';

type Role = 'manager' | 'staff' | 'marketing';

interface Props {
  role: Role;
}

const roleDefaults: Record<Role, { name: string; email: string; title: string; initials: string }> = {
  manager: { name: 'Maya Thompson', email: 'maya@opsplatform.io', title: 'Department Manager', initials: 'MT' },
  staff:   { name: 'Priya Patel',   email: 'priya@opsplatform.io', title: 'Operations Staff', initials: 'PP' },
  marketing: { name: 'Jordan Lee', email: 'jordan@opsplatform.io', title: 'Marketing Representative', initials: 'JL' },
};

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

export default function SharedSettingsModule({ role }: Props) {
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useUI();
  const { user } = useAuth();

  const defaults = roleDefaults[role];

  const [activeTab, setActiveTab] = useState('Profile');
  const [isSaving, setIsSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [formData, setFormData] = useState({
    fullName: defaults.name,
    email: defaults.email,
    title: defaults.title,
    phone: '+1 (555) 000-0000',
    timezone: 'UTC-5 (Eastern Time)',
    language: 'English (US)',
  });

  const [notifSettings, setNotifSettings] = useState({
    emailNotifs: true,
    pushNotifs: true,
    taskReminders: true,
    invoiceAlerts: role === 'manager' || role === 'marketing',
    leadUpdates: role === 'marketing',
    weeklyDigest: true,
    whatsappNotifs: false,
    whatsappNum: '+1 (555) 000-0000',
    assignmentAlerts: true,
    overdueAlerts: true,
  });

  const [securityData, setSecurityData] = useState({
    currentPass: '',
    newPass: '',
    confirmPass: '',
    twoFactor: true,
    sessionTimeout: '30',
  });

  const [preferences, setPreferences] = useState({
    compactMode: false,
    showAvatars: true,
    autoSave: true,
    soundEffects: false,
  });

  const [showPass, setShowPass] = useState(false);

  // Load user from session (AuthContext) and persisted notifSettings from the API
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        fullName: user.name || defaults.name,
        email: user.email || defaults.email,
      }));
    }
    // Fetch persisted notification settings from DB
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.notifSettings && Object.keys(data.notifSettings).length > 0) {
          setNotifSettings(prev => ({ ...prev, ...data.notifSettings }));
        }
      })
      .catch(() => { /* silently ignore — defaults remain */ })
      .finally(() => setSettingsLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, defaults.name, defaults.email]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (activeTab === 'Notifications') {
        // Persist notification preferences to DB via UserSettings model
        const res = await fetch('/api/settings', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
          body: JSON.stringify({ action: 'notifications', notifSettings }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Notification preferences saved', 'success');
        } else {
          showToast(data.error || 'Failed to save notification preferences', 'error');
        }
      } else if (activeTab === 'Profile') {
        // Persist name and email changes to User model
        const res = await fetch('/api/settings', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
          body: JSON.stringify({
            action: 'profile',
            name: formData.fullName,
            email: formData.email,
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Profile updated successfully', 'success');
        } else {
          showToast(data.error || 'Failed to update profile', 'error');
        }
      } else {
        // Preferences / Appearance tabs — local-only (no DB field yet)
        showToast(`${activeTab} settings saved`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      showToast(`Save failed: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityData.currentPass) {
      showToast('Please enter your current password', 'warning'); return;
    }
    if (securityData.newPass.length < 8) {
      showToast('New password must be at least 8 characters', 'warning'); return;
    }
    if (securityData.newPass !== securityData.confirmPass) {
      showToast('New passwords do not match', 'error'); return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'client' },
        body: JSON.stringify({
          action: 'password',
          currentPass: securityData.currentPass,
          newPass: securityData.newPass,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSecurityData(p => ({ ...p, currentPass: '', newPass: '', confirmPass: '' }));
        showToast('Password updated successfully', 'success');
      } else {
        showToast(data.error || 'Failed to update password', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      showToast(`Password change failed: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const roleLabel = role === 'manager' ? 'Manager' : role === 'staff' ? 'Staff' : 'Marketing Rep';

  const tabs = [
    { name: 'Profile', icon: User },
    { name: 'Appearance', icon: SunIcon },
    { name: 'Notifications', icon: Bell },
    { name: 'Security', icon: Shield },
    { name: 'Preferences', icon: Sliders },
  ];

  const toggleNotif = (key: keyof typeof notifSettings) => {
    setNotifSettings(p => ({ ...p, [key]: !p[key] }));
  };

  return (
    <div className="flex-1 flex h-full bg-base text-primary overflow-hidden transition-colors">
      {/* Sidebar Nav */}
      <div className="w-56 border-r border-border shrink-0 bg-surface flex flex-col p-5 z-10">
        <h2 className="text-lg font-bold mb-6">Settings</h2>
        <nav className="flex flex-col gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setActiveTab(tab.name)}
              className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.name
                  ? 'bg-base text-accent border border-border shadow-sm'
                  : 'text-secondary hover:bg-base hover:text-primary border border-transparent'
              }`}
            >
              <tab.icon
                size={16}
                className={activeTab === tab.name ? 'text-accent' : 'text-secondary'}
              />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-base p-8">
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl font-bold tracking-tight mb-1">{activeTab}</h1>
            <p className="text-secondary text-sm">
              Manage your {activeTab.toLowerCase()} preferences and account settings.
            </p>
          </div>

          <form onSubmit={activeTab === 'Security' ? handlePasswordChange : handleSave}>
            <AnimatePresence mode="wait">

              {/* ─── PROFILE ─── */}
              {activeTab === 'Profile' && (
                <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* Avatar Card */}
                  <div className="flex items-center gap-6 mb-2 bg-surface p-6 rounded-xl border border-border">
                    <div className="w-20 h-20 rounded-full border-2 border-border bg-accent/10 flex items-center justify-center font-bold text-2xl text-accent shrink-0">
                      {getInitials(formData.fullName)}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => showToast('Avatar updates are managed by the System Administrator.', 'info')}
                        className="px-4 py-2 border border-border bg-base text-sm font-medium rounded-lg hover:bg-surface transition-colors mb-2"
                      >
                        Upload new picture
                      </button>
                      <p className="text-xs text-secondary">JPG, GIF or PNG. 1MB max.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Full Name</label>
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                        className="w-full bg-surface border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Email Address</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-surface border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Phone Number</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-surface border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Role / Title</label>
                      <input
                        type="text"
                        disabled
                        value={roleLabel.toUpperCase()}
                        className="w-full bg-base/50 border border-border px-4 py-2.5 rounded-lg text-sm text-secondary cursor-not-allowed outline-none"
                      />
                      <p className="text-[10px] text-tertiary font-medium mt-1">
                        Role can only be changed from the System Directory panel.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ─── APPEARANCE ─── */}
              {activeTab === 'Appearance' && (
                <motion.div key="appearance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="bg-surface p-6 rounded-xl border border-border">
                    <h3 className="font-semibold mb-4">Interface Theme</h3>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => { if (theme !== 'light') { toggleTheme(); showToast('Switched to Light Mode', 'info'); } }}
                        className={`flex-1 border p-4 rounded-xl flex flex-col items-center gap-3 transition-all ${theme === 'light' ? 'border-accent bg-accent/5' : 'border-border bg-base hover:bg-surface'}`}
                      >
                        <div className="w-full h-16 bg-white rounded border border-gray-200 shadow-sm flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                          Bright Theme
                        </div>
                        <span className="text-xs font-bold flex items-center gap-2"><Sun size={14} /> Light Mode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (theme !== 'dark') { toggleTheme(); showToast('Switched to Dark Mode', 'info'); } }}
                        className={`flex-1 border p-4 rounded-xl flex flex-col items-center gap-3 transition-all ${theme === 'dark' ? 'border-accent bg-accent/5' : 'border-border bg-base hover:bg-surface'}`}
                      >
                        <div className="w-full h-16 bg-slate-950 rounded border border-white/10 shadow-sm flex items-center justify-center text-[10px] text-white font-bold uppercase tracking-wider">
                          Midnight Theme
                        </div>
                        <span className="text-xs font-bold flex items-center gap-2"><Moon size={14} /> Dark Mode</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ─── NOTIFICATIONS ─── */}
              {activeTab === 'Notifications' && (
                <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-tertiary uppercase tracking-wider px-1">In-App & Email Channels</h3>
                    {[
                      { key: 'emailNotifs',   label: 'Email Notifications',  desc: 'Receive email alerts for important platform updates' },
                      { key: 'pushNotifs',    label: 'Push Notifications',   desc: 'Browser push notifications for real-time alerts' },
                      { key: 'taskReminders', label: 'Task Reminders',       desc: 'Get reminded about upcoming task deadlines' },
                      ...(role === 'manager' || role === 'marketing' ? [
                        { key: 'invoiceAlerts', label: 'Invoice Alerts',     desc: 'Notifications for overdue or paid invoices' },
                      ] : []),
                      ...(role === 'marketing' ? [
                        { key: 'leadUpdates', label: 'Lead Updates',         desc: 'Alerts when a lead changes stage or status' },
                      ] : []),
                      { key: 'weeklyDigest',  label: 'Weekly Digest',        desc: 'Summary performance email every Monday morning' },
                    ].map(item => (
                      <div key={item.key} className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl">
                        <div>
                          <h4 className="text-sm font-semibold">{item.label}</h4>
                          <p className="text-xs text-secondary mt-0.5">{item.desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleNotif(item.key as keyof typeof notifSettings)}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${notifSettings[item.key as keyof typeof notifSettings] ? 'bg-accent' : 'bg-border'}`}
                        >
                          <span
                            className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform left-0.5"
                            style={{ transform: notifSettings[item.key as keyof typeof notifSettings] ? 'translateX(22px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* WhatsApp Integration */}
                  <div className="bg-surface p-6 rounded-xl border border-accent/20 space-y-4">
                    <h3 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-2">📱 WhatsApp Notifications</h3>
                    <p className="text-xs text-secondary leading-relaxed">
                      Route urgent task assignments, critical overdue warnings, and shift check-ins directly to your mobile phone via secure WhatsApp gateways.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-tertiary uppercase tracking-wide mb-1.5">WhatsApp Mobile Line</label>
                        <input
                          type="text"
                          value={notifSettings.whatsappNum}
                          onChange={e => setNotifSettings({ ...notifSettings, whatsappNum: e.target.value })}
                          className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-xs focus:border-accent outline-none"
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-base border border-border rounded-xl">
                        <div>
                          <h4 className="text-xs font-bold">Enable WhatsApp Route</h4>
                          <p className="text-[10px] text-tertiary">Route critical alerts</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleNotif('whatsappNotifs')}
                          className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${notifSettings.whatsappNotifs ? 'bg-accent' : 'bg-border'}`}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform left-0.5"
                            style={{ transform: notifSettings.whatsappNotifs ? 'translateX(20px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>
                    </div>

                    {notifSettings.whatsappNotifs && (
                      <div className="space-y-3 pt-3 border-t border-border mt-3">
                        {[
                          { key: 'assignmentAlerts', label: 'New Task Assignments',       desc: 'Instant ping when assigned to a new project' },
                          { key: 'overdueAlerts',    label: 'Overdue Task Escalations',   desc: 'Daily notification alert if any task slips deadline' },
                        ].map(alert => (
                          <div key={alert.key} className="flex items-center justify-between text-xs py-1">
                            <div>
                              <span className="font-semibold text-secondary">{alert.label}</span>
                              <p className="text-[9px] text-tertiary">{alert.desc}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleNotif(alert.key as keyof typeof notifSettings)}
                              className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${notifSettings[alert.key as keyof typeof notifSettings] ? 'bg-accent' : 'bg-border'}`}
                            >
                              <span
                                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform left-0.5"
                                style={{ transform: notifSettings[alert.key as keyof typeof notifSettings] ? 'translateX(16px)' : 'translateX(0)' }}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ─── SECURITY ─── */}
              {activeTab === 'Security' && (
                <motion.div key="security" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* Change Password */}
                  <div className="bg-surface p-6 rounded-xl border border-border space-y-4">
                    <h3 className="font-semibold flex items-center gap-2"><Lock size={16} /> Change Password</h3>
                    <div>
                      <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Current Password</label>
                      <div className="relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          value={securityData.currentPass}
                          onChange={e => setSecurityData({ ...securityData, currentPass: e.target.value })}
                          placeholder="••••••••"
                          className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent outline-none pr-10"
                        />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary">
                          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">New Password</label>
                        <input
                          type="password"
                          value={securityData.newPass}
                          onChange={e => setSecurityData({ ...securityData, newPass: e.target.value })}
                          placeholder="••••••••"
                          className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Confirm Password</label>
                        <input
                          type="password"
                          value={securityData.confirmPass}
                          onChange={e => setSecurityData({ ...securityData, confirmPass: e.target.value })}
                          placeholder="••••••••"
                          className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2FA */}
                  <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl">
                    <div>
                      <h4 className="text-sm font-semibold">Two-Factor Authentication</h4>
                      <p className="text-xs text-secondary mt-0.5">Add an extra layer of security to your account</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSecurityData(p => ({ ...p, twoFactor: !p.twoFactor }))}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${securityData.twoFactor ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span
                        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform left-0.5"
                        style={{ transform: securityData.twoFactor ? 'translateX(22px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>

                  {/* Session Timeout */}
                  <div className="bg-surface p-4 rounded-xl border border-border">
                    <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Session Timeout (minutes)</label>
                    <select
                      value={securityData.sessionTimeout}
                      onChange={e => setSecurityData({ ...securityData, sessionTimeout: e.target.value })}
                      className="w-full px-4 py-2.5 border border-border bg-base rounded-lg text-sm focus:border-accent outline-none appearance-none"
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="120">2 hours</option>
                    </select>
                  </div>

                  {/* Active Sessions */}
                  <div className="bg-surface p-5 rounded-xl border border-border">
                    <h3 className="font-semibold mb-4 text-sm">Active Sessions</h3>
                    <div className="space-y-3">
                      {[
                        { device: 'Chrome on Windows', location: 'Mumbai, IN', time: 'Current session', active: true },
                        { device: 'Safari on iPhone',  location: 'Delhi, IN',  time: '2 hours ago',     active: false },
                      ].map((s, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-base rounded-lg border border-border/50">
                          <div>
                            <div className="text-xs font-semibold">{s.device}</div>
                            <div className="text-[10px] text-secondary">{s.location} · {s.time}</div>
                          </div>
                          {s.active ? (
                            <span className="text-[10px] font-bold text-emerald-500 uppercase">Active</span>
                          ) : (
                            <button type="button" onClick={() => showToast('Session revoked', 'success')} className="text-[10px] font-bold text-red-500 hover:underline">Revoke</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ─── PREFERENCES ─── */}
              {activeTab === 'Preferences' && (
                <motion.div key="preferences" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* Display */}
                  <div className="bg-surface p-6 rounded-xl border border-border space-y-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2"><Globe size={16} /> Locale & Display</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Language</label>
                        <select
                          value={formData.language}
                          onChange={e => setFormData({ ...formData, language: e.target.value })}
                          className="w-full px-4 py-2.5 border border-border bg-base rounded-lg text-sm focus:border-accent outline-none appearance-none"
                        >
                          <option>English (US)</option>
                          <option>English (UK)</option>
                          <option>Spanish</option>
                          <option>French</option>
                          <option>German</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Timezone</label>
                        <select
                          value={formData.timezone}
                          onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                          className="w-full px-4 py-2.5 border border-border bg-base rounded-lg text-sm focus:border-accent outline-none appearance-none"
                        >
                          <option>UTC-5 (Eastern Time)</option>
                          <option>UTC-6 (Central Time)</option>
                          <option>UTC-7 (Mountain Time)</option>
                          <option>UTC-8 (Pacific Time)</option>
                          <option>UTC+5:30 (IST)</option>
                          <option>UTC+0 (GMT)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Account Preferences Toggles */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-tertiary uppercase tracking-wider px-1">Account Preferences</h3>
                    {[
                      { key: 'compactMode',  label: 'Compact Mode',       desc: 'Reduce spacing for higher information density' },
                      { key: 'showAvatars',  label: 'Show Avatars',        desc: 'Display user avatars throughout the interface' },
                      { key: 'autoSave',     label: 'Auto-Save Changes',   desc: 'Automatically save form changes as you type' },
                      { key: 'soundEffects', label: 'Sound Effects',       desc: 'Play subtle sounds for notifications and actions' },
                    ].map(item => (
                      <div key={item.key} className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl">
                        <div>
                          <h4 className="text-sm font-semibold">{item.label}</h4>
                          <p className="text-xs text-secondary mt-0.5">{item.desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreferences(p => ({ ...p, [item.key]: !p[item.key as keyof typeof p] }))}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${preferences[item.key as keyof typeof preferences] ? 'bg-accent' : 'bg-border'}`}
                        >
                          <span
                            className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform left-0.5"
                            style={{ transform: preferences[item.key as keyof typeof preferences] ? 'translateX(22px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Danger Zone */}
                  <div className="bg-red-500/5 p-5 rounded-xl border border-red-500/20 space-y-3">
                    <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider">Danger Zone</h3>
                    <p className="text-xs text-secondary">These actions are irreversible. Please proceed with caution.</p>
                    <button
                      type="button"
                      onClick={() => showToast('Account deletion requires System Administrator approval.', 'warning')}
                      className="px-4 py-2 border border-red-500/30 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      Request Account Deletion
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>

            {/* Save Footer */}
            <div className="mt-8 pt-6 border-t border-border flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-accent text-white font-semibold rounded-lg hover:bg-indigo-600 transition-colors shadow-lg disabled:opacity-50 text-xs uppercase tracking-wider active:scale-95"
              >
                {isSaving
                  ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  : <Save size={14} />}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
