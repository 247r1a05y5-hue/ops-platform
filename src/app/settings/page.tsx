'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, EyeOff, Eye, Mail, Plus, Edit, Trash2, Save, User, Bell, Shield, Building, CreditCard } from 'lucide-react';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useUI();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Profile');
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    fullName: 'Maya Thompson', 
    email: 'maya@opsplatform.io', 
    role: 'operations director',
  });

  const [notifSettings, setNotifSettings] = useState({
    emailNotifs: true, 
    pushNotifs: true, 
    taskReminders: true, 
    invoiceAlerts: true, 
    leadUpdates: false, 
    weeklyDigest: true,
    whatsappNotifs: true,
    whatsappNum: '+1 (555) 902-3481',
    assignmentAlerts: true,
    overdueAlerts: true
  });

  const [securityData, setSecurityData] = useState({ currentPass: '', newPass: '', confirmPass: '', twoFactor: true, sessionTimeout: '30' });
  const [showPass, setShowPass] = useState(false);
  const [teamMembers, setTeamMembers] = useState([
    { id: 1, name: 'Maya Thompson', email: 'maya@opsplatform.io', role: 'Admin', status: 'Active' },
    { id: 2, name: 'Priya Patel', email: 'priya@opsplatform.io', role: 'Employee', status: 'Active' },
    { id: 3, name: 'Jordan Lee', email: 'jordan@opsplatform.io', role: 'Marketing Rep', status: 'Active' },
  ]);
  const [billingPlan] = useState('Growth');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Employee');

  // Load user from AuthContext (cookie session) — no localStorage
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        fullName: user.name || prev.fullName,
        email: user.email || prev.email,
        role: user.displayRole || prev.role,
      }));
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (activeTab === 'Security') {
        // Password change
        if (!securityData.currentPass || !securityData.newPass) {
          showToast('Fill in current and new password', 'warning');
          setIsSaving(false); return;
        }
        if (securityData.newPass !== securityData.confirmPass) {
          showToast('New passwords do not match', 'warning');
          setIsSaving(false); return;
        }
        const res = await fetch('/api/settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'password', currentPass: securityData.currentPass, newPass: securityData.newPass }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Password updated successfully', 'success');
          setSecurityData(prev => ({ ...prev, currentPass: '', newPass: '', confirmPass: '' }));
        } else { showToast(data.error || 'Password update failed', 'error'); }

      } else if (activeTab === 'Notifications') {
        const res = await fetch('/api/settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'notifications', notifSettings }),
        });
        const data = await res.json();
        if (data.success) { showToast('Notification preferences saved', 'success'); }
        else { showToast(data.error || 'Save failed', 'error'); }

      } else {
        // Profile update
        const res = await fetch('/api/settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'profile', name: formData.fullName, email: formData.email }),
        });
        const data = await res.json();
        if (data.success) { showToast('Profile saved successfully', 'success'); }
        else { showToast(data.error || 'Save failed', 'error'); }
      }
    } catch { showToast('Network error. Please try again.', 'error'); }
    finally { setIsSaving(false); }
  };

  const handleInvite = () => {
    if (!inviteEmail) { showToast('Please enter an email', 'warning'); return; }
    setTeamMembers(prev => [...prev, { id: Date.now(), name: inviteEmail.split('@')[0], email: inviteEmail, role: inviteRole, status: 'Invited' }]);
    showToast(`Invitation sent to ${inviteEmail}`, 'success');
    setInviteEmail(''); setInviteRole('Employee');
  };

  const removeMember = (id: number) => {
    setTeamMembers(prev => prev.filter(m => m.id !== id));
    showToast('Team member removed', 'success');
  };

  const tabs = [
    { name: 'Profile', icon: User }, 
    { name: 'Appearance', icon: SunIcon },
    { name: 'Notifications', icon: Bell }, 
    { name: 'Security', icon: Shield },
    { name: 'Team & Roles', icon: Building }, 
    { name: 'Billing', icon: CreditCard },
  ];

  const currentRole = formData.role.toLowerCase();
  
  // Filter tabs dynamically based on user capabilities:
  // - Billing requires Admin
  // - Team & Roles requires Admin or Manager
  const allowedTabs = tabs.filter(tab => {
    if (tab.name === 'Team & Roles') {
      return currentRole === 'admin' || currentRole === 'manager' || currentRole === 'operations director';
    }
    if (tab.name === 'Billing') {
      return currentRole === 'admin';
    }
    return true;
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const roleColor = (r: string) => {
    const roleLower = r.toLowerCase();
    if (roleLower === 'admin' || roleLower === 'operations director') return 'text-red-500 bg-red-55 border-red-200 dark:bg-red-500/10 dark:border-red-500/20';
    if (roleLower === 'manager') return 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20';
    return 'text-secondary bg-surface border-border';
  };

  return (
    <div className="flex-1 flex h-full bg-base text-primary overflow-hidden transition-colors">
      <div className="w-64 border-r border-border shrink-0 bg-surface flex flex-col p-6 z-10">
        <h2 className="text-xl font-bold mb-8">Settings</h2>
        <nav className="flex flex-col gap-1">
          {allowedTabs.map((tab) => (
            <button key={tab.name} type="button" onClick={() => setActiveTab(tab.name)}
              className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.name ? 'bg-base text-accent border border-border shadow-sm' : 'text-secondary hover:bg-base hover:text-primary border border-transparent'}`}>
              <tab.icon size={16} className={activeTab === tab.name ? 'text-accent' : 'text-secondary'}/> {tab.name}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto bg-base p-8 relative">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl font-bold tracking-tight mb-2">{activeTab}</h1>
            <p className="text-secondary text-sm">Manage your {activeTab.toLowerCase()} preferences and account settings.</p>
          </div>

          <form onSubmit={handleSave}>
            <AnimatePresence mode="wait">

            {activeTab === 'Profile' && (
              <motion.div key="profile" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
                <div className="flex items-center gap-6 mb-8 bg-surface p-6 rounded-xl border border-border">
                  <div className="w-20 h-20 rounded-full border-2 border-border bg-accent/10 flex items-center justify-center font-bold text-2xl text-accent">{getInitials(formData.fullName)}</div>
                  <div>
                    <button type="button" onClick={() => showToast('Avatar updates are currently locked to system administrator presets.', 'info')} className="px-4 py-2 border border-border bg-base text-sm font-medium rounded-lg hover:bg-surface transition-colors mb-2">Upload new picture</button>
                    <p className="text-xs text-secondary">JPG, GIF or PNG. 1MB max.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Full Name</label>
                    <input type="text" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full bg-surface border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Email Address</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-surface border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Role / Title</label>
                  <input type="text" disabled className="w-full bg-base/50 border border-border px-4 py-2.5 rounded-lg text-sm text-secondary cursor-not-allowed outline-none" value={formData.role.toUpperCase()} />
                  <p className="text-[10px] text-tertiary font-medium mt-1">Clearance configuration roles can only be adjusted from the System Directory panel.</p>
                </div>
              </motion.div>
            )}

            {activeTab === 'Appearance' && (
              <motion.div key="appearance" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
                <div className="bg-surface p-6 rounded-xl border border-border">
                  <h3 className="font-semibold mb-4">Interface Theme</h3>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => { if(theme !== 'light') { toggleTheme(); showToast('Switched to Light Mode', 'info'); } }} className={`flex-1 border p-4 rounded-xl flex flex-col items-center gap-3 transition-all ${theme === 'light' ? 'border-accent bg-accent/5' : 'border-border bg-base hover:bg-surface'}`}>
                      <div className="w-full h-16 bg-white rounded border border-gray-200 shadow-sm flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">Bright Theme</div>
                      <span className="text-xs font-bold">Light mode</span>
                    </button>
                    <button type="button" onClick={() => { if(theme !== 'dark') { toggleTheme(); showToast('Switched to Dark Mode', 'info'); } }} className={`flex-1 border p-4 rounded-xl flex flex-col items-center gap-3 transition-all ${theme === 'dark' ? 'border-accent bg-accent/5' : 'border-border bg-base hover:bg-surface'}`}>
                      <div className="w-full h-16 bg-slate-950 rounded border border-white/10 shadow-sm flex items-center justify-center text-[10px] text-white font-bold uppercase tracking-wider">Midnight Theme</div>
                      <span className="text-xs font-bold">Dark Mode</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Notifications' && (
              <motion.div key="notif" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-tertiary uppercase tracking-wider px-1">In-App & Email Channel Routing</h3>
                  {[
                    { key: 'emailNotifs', label: 'Email Notifications', desc: 'Receive email alerts for important platform updates' },
                    { key: 'pushNotifs', label: 'Push Notifications', desc: 'Browser push notifications for real-time alerts' },
                    { key: 'taskReminders', label: 'Task Reminders', desc: 'Get reminded about upcoming task deadlines' },
                    { key: 'invoiceAlerts', label: 'Invoice Alerts', desc: 'Notifications for overdue or paid invoices' },
                    { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'Summary performance email every Monday morning' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl">
                      <div><h4 className="text-sm font-semibold">{item.label}</h4><p className="text-xs text-secondary mt-0.5">{item.desc}</p></div>
                      <button type="button" onClick={() => setNotifSettings(p => ({...p, [item.key]: !p[item.key as keyof typeof p]}))}
                        className={`w-11 h-6 rounded-full transition-colors relative ${notifSettings[item.key as keyof typeof notifSettings] ? 'bg-accent' : 'bg-border'}`}>
                        <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform left-0.5"
                          style={{ transform: notifSettings[item.key as keyof typeof notifSettings] ? 'translateX(22px)' : 'translateX(0)' }}/>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-surface p-6 rounded-xl border border-accent/20 space-y-4">
                  <h3 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-2">📱 Mock WhatsApp Integration</h3>
                  <p className="text-xs text-secondary leading-relaxed">Route urgent task assignments, critical overdue warnings, and shift check-ins directly to your mobile phone via secure WhatsApp gateways.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-[10px] font-bold text-tertiary uppercase tracking-wide mb-1.5">WhatsApp Mobile Line</label>
                      <input 
                        type="text" 
                        value={notifSettings.whatsappNum} 
                        onChange={e => setNotifSettings({...notifSettings, whatsappNum: e.target.value})} 
                        className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-xs focus:border-accent outline-none" 
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-base border border-border rounded-xl">
                      <div>
                        <h4 className="text-xs font-bold">Enable WhatsApp Route</h4>
                        <p className="text-[10px] text-tertiary">Route critical alerts</p>
                      </div>
                      <button type="button" onClick={() => setNotifSettings(p => ({...p, whatsappNotifs: !p.whatsappNotifs}))}
                        className={`w-10 h-5 rounded-full transition-colors relative ${notifSettings.whatsappNotifs ? 'bg-accent' : 'bg-border'}`}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform left-0.5"
                          style={{ transform: notifSettings.whatsappNotifs ? 'translateX(20px)' : 'translateX(0)' }}/>
                      </button>
                    </div>
                  </div>

                  {notifSettings.whatsappNotifs && (
                    <div className="space-y-3 pt-3 border-t border-border mt-3">
                      {[
                        { key: 'assignmentAlerts', label: 'New Task Assignments', desc: 'Instant ping when assigned to a new project' },
                        { key: 'overdueAlerts', label: 'Overdue Task Escalations', desc: 'Daily notification alert if any task slips deadline' }
                      ].map(alert => (
                        <div key={alert.key} className="flex items-center justify-between text-xs py-1">
                          <div>
                            <span className="font-semibold text-secondary">{alert.label}</span>
                            <p className="text-[9px] text-tertiary">{alert.desc}</p>
                          </div>
                          <button type="button" onClick={() => setNotifSettings(p => ({...p, [alert.key]: !p[alert.key as keyof typeof p]}))}
                            className={`w-8 h-4 rounded-full transition-colors relative ${notifSettings[alert.key as keyof typeof notifSettings] ? 'bg-accent' : 'bg-border'}`}>
                            <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform left-0.5"
                              style={{ transform: notifSettings[alert.key as keyof typeof notifSettings] ? 'translateX(16px)' : 'translateX(0)' }}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'Security' && (
              <motion.div key="security" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
                <div className="bg-surface p-6 rounded-xl border border-border space-y-4">
                  <h3 className="font-semibold flex items-center gap-2"><Lock size={16}/> Change Password</h3>
                  <div><label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Current Password</label>
                    <div className="relative"><input type={showPass ? 'text' : 'password'} value={securityData.currentPass} onChange={e => setSecurityData({...securityData, currentPass: e.target.value})} placeholder="••••••••" className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent outline-none pr-10"/>
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary">{showPass ? <EyeOff size={14}/> : <Eye size={14}/>}</button></div></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">New Password</label>
                      <input type="password" value={securityData.newPass} onChange={e => setSecurityData({...securityData, newPass: e.target.value})} placeholder="••••••••" className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent outline-none"/></div>
                    <div><label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Confirm Password</label>
                      <input type="password" value={securityData.confirmPass} onChange={e => setSecurityData({...securityData, confirmPass: e.target.value})} placeholder="••••••••" className="w-full bg-base border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent outline-none"/></div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-xl">
                  <div><h4 className="text-sm font-semibold">Two-Factor Authentication</h4><p className="text-xs text-secondary mt-0.5">Add an extra layer of security to your account</p></div>
                  <button type="button" onClick={() => setSecurityData(p => ({...p, twoFactor: !p.twoFactor}))}
                    className={`w-11 h-6 rounded-full transition-colors relative ${securityData.twoFactor ? 'bg-accent' : 'bg-border'}`}>
                    <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform left-0.5" style={{transform: securityData.twoFactor ? 'translateX(22px)' : 'translateX(0)'}}/>
                  </button>
                </div>
                <div className="bg-surface p-4 rounded-xl border border-border">
                  <label className="block text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Session Timeout (minutes)</label>
                  <select value={securityData.sessionTimeout} onChange={e => setSecurityData({...securityData, sessionTimeout: e.target.value})}
                    className="w-full px-4 py-2.5 border border-border bg-base rounded-lg text-sm focus:border-accent outline-none appearance-none">
                    <option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option>
                  </select>
                </div>
              </motion.div>
            )}

            {activeTab === 'Team & Roles' && (
              <motion.div key="team" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
                <div className="bg-surface p-5 rounded-xl border border-border">
                  <h3 className="font-semibold mb-4 flex items-center gap-2"><Mail size={16}/> Invite Team Member</h3>
                  <div className="flex gap-3">
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className="flex-1 bg-base border border-border px-4 py-2.5 rounded-lg text-sm focus:border-accent outline-none"/>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="px-3 py-2.5 border border-border bg-base rounded-lg text-sm focus:border-accent outline-none appearance-none">
                      <option>Employee</option><option>Manager</option><option>Marketing Rep</option><option>Admin</option>
                    </select>
                    <button type="button" onClick={handleInvite} className="px-4 py-2.5 bg-accent text-white font-semibold rounded-lg text-sm hover:bg-emerald-600 flex items-center gap-2"><Plus size={14}/> Invite</button>
                  </div>
                </div>
                <div className="border border-border rounded-xl overflow-hidden bg-surface">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-base border-b border-border text-xs font-bold text-secondary uppercase tracking-wider">
                      <tr><th className="px-5 py-3">Member</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {teamMembers.map(m => (
                        <tr key={m.id} className="hover:bg-base transition-colors">
                          <td className="px-5 py-3"><div className="font-semibold text-primary">{m.name}</div><div className="text-xs text-secondary">{m.email}</div></td>
                          <td className="px-5 py-3"><span className={`inline-flex px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${roleColor(m.role)}`}>{m.role}</span></td>
                          <td className="px-5 py-3"><span className={`text-xs font-semibold ${m.status === 'Active' ? 'text-emerald-500' : 'text-orange-500'}`}>{m.status}</span></td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button type="button" onClick={() => showToast(`Editing ${m.name}'s role`, 'info')} className="p-1.5 text-secondary hover:text-accent bg-base border border-border rounded transition-colors"><Edit size={14}/></button>
                              {m.email !== formData.email && <button type="button" onClick={() => removeMember(m.id)} className="p-1.5 text-secondary hover:text-red-500 bg-base border border-border rounded transition-colors"><Trash2 size={14}/></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'Billing' && (
              <motion.div key="billing" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
                <div className="bg-surface p-6 rounded-xl border border-accent/30 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-3xl rounded-full"></div>
                  <div className="relative z-10">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-2 py-1 rounded border border-accent/20">Current Plan</span>
                    <h3 className="text-2xl font-extrabold mt-3 mb-1">{billingPlan} Plan</h3>
                    <p className="text-secondary text-sm mb-4">$79/month · Billed monthly · Renews Jun 1, 2026</p>
                    <button type="button" onClick={() => showToast('Upgrade options loading...', 'info')} className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-emerald-600">Upgrade Plan</button>
                  </div>
                </div>
                <div className="bg-surface p-5 rounded-xl border border-border">
                  <h3 className="font-semibold mb-4">Payment Method</h3>
                  <div className="flex items-center justify-between p-4 bg-base border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-7 bg-blue-600 rounded flex items-center justify-center text-white text-[10px] font-bold animate-pulse">VISA</div>
                      <div><div className="text-sm font-semibold">•••• •••• •••• 4242</div><div className="text-xs text-secondary">Expires 12/2027</div></div>
                    </div>
                    <button type="button" onClick={() => showToast('Update card flow opening...', 'info')} className="text-xs text-accent font-semibold hover:underline">Update</button>
                  </div>
                </div>
                <div className="bg-surface p-5 rounded-xl border border-border">
                  <h3 className="font-semibold mb-4">Recent Invoices</h3>
                  <div className="space-y-2">
                    {[{d:'May 2026',a:'$79.00',s:'Paid'},{d:'Apr 2026',a:'$79.00',s:'Paid'},{d:'Mar 2026',a:'$79.00',s:'Paid'}].map((inv,i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-base border border-border rounded-lg text-xs">
                        <span className="font-medium">{inv.d}</span>
                        <span className="font-bold">{inv.a}</span>
                        <span className="font-bold uppercase text-emerald-500">{inv.s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            </AnimatePresence>

            <div className="mt-8 pt-6 border-t border-border flex justify-end">
              <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-2.5 bg-accent text-white font-semibold rounded-lg hover:bg-indigo-600 transition-colors shadow-lg disabled:opacity-50 text-xs uppercase tracking-wider active:scale-95">
                {isSaving ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={14} />}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path>
      <path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path>
      <path d="M2 12h2"></path><path d="M20 12h2"></path>
      <path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>
    </svg>
  );
}
