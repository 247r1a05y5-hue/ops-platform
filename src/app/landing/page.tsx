'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, ArrowRight, CheckSquare, Target, FileText, BarChart3, Plug, Users, Zap, Star, ChevronRight, Check } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: 'linear-gradient(135deg, #eef0fb 0%, #e8eaf6 40%, #ede8f5 100%)', minHeight: '100vh', color: '#1e1b4b', overflowX: 'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(16px)', background: 'rgba(238, 240, 251, 0.85)', borderBottom: '1px solid rgba(99, 102, 241, 0.12)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #4338ca, #6366f1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.4)' }}>
              <Shield size={20} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#3730a3', letterSpacing: '-0.02em' }}>Ops Platform</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1 }}>Enterprise Operations</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ display: 'flex', gap: 32, fontSize: 14, fontWeight: 500, color: '#64748b' }}>
            <a href="#features" style={{ textDecoration: 'none', color: '#64748b', transition: 'color 0.2s' }} onMouseOver={e => (e.currentTarget.style.color = '#4338ca')} onMouseOut={e => (e.currentTarget.style.color = '#64748b')}>Features</a>
            <a href="#architecture" style={{ textDecoration: 'none', color: '#64748b', transition: 'color 0.2s' }} onMouseOver={e => (e.currentTarget.style.color = '#4338ca')} onMouseOut={e => (e.currentTarget.style.color = '#64748b')}>Role Access</a>
            <a href="#testimonials" style={{ textDecoration: 'none', color: '#64748b', transition: 'color 0.2s' }} onMouseOver={e => (e.currentTarget.style.color = '#4338ca')} onMouseOut={e => (e.currentTarget.style.color = '#64748b')}>Integrations</a>
          </nav>

          {/* CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/login" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 600, color: '#4338ca', padding: '8px 20px', borderRadius: 10, border: '1.5px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)', transition: 'all 0.2s' }}>Sign In</Link>
            <Link href="/login" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: 'white', padding: '10px 22px', borderRadius: 10, boxShadow: '0 4px 14px rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
              Get Started <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px 60px', textAlign: 'center', position: 'relative' }}>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, border: '1.5px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#4338ca', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, background: '#6366f1', borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Now in active operations · v1.0
        </div>

        <h1 style={{ fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 24, color: '#1e1b4b', position: 'relative' }}>
          Unified operations<br />
          <span style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>for growing teams</span>
        </h1>

        <p style={{ fontSize: 19, color: '#64748b', maxWidth: 600, margin: '0 auto 40px', lineHeight: 1.65, fontWeight: 400 }}>
          Manage tasks, leads, invoices, and your entire team in one place — replacing scattered spreadsheets, emails, and WhatsApp threads.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 60, flexWrap: 'wrap' }}>
          <Link href="/login" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: 'white', fontWeight: 700, borderRadius: 12, boxShadow: '0 6px 24px rgba(99,102,241,0.4)', fontSize: 15, transition: 'all 0.2s' }}>
            Start for free <ArrowRight size={18} />
          </Link>
          <Link href="/login" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'white', color: '#4338ca', fontWeight: 700, borderRadius: 12, border: '1.5px solid rgba(99,102,241,0.25)', fontSize: 15, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', transition: 'all 0.2s' }}>
            Sign in to dashboard
          </Link>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, flexWrap: 'wrap', background: 'white', borderRadius: 16, padding: '16px 32px', boxShadow: '0 2px 16px rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.1)', maxWidth: 680, margin: '0 auto' }}>
          {[
            { label: 'Department Ranks', value: 'Admin & Manager' },
            { label: 'Core Workflows', value: 'Tasks & CRM' },
            { label: 'Communication', value: 'Chat & Meet' },
            { label: 'Channels', value: 'Email & WhatsApp' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 16px', borderRight: i < 3 ? '1px solid rgba(99,102,241,0.12)' : 'none', minWidth: 120 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#4338ca', letterSpacing: '-0.02em' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MOCK UI PREVIEW ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto 80px', padding: '0 32px' }}>
        <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.12)', overflow: 'hidden' }}>
          {/* Browser chrome */}
          <div style={{ background: 'linear-gradient(135deg, #eef0fb, #e8eaf6)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
            <div style={{ flex: 1, background: 'rgba(99,102,241,0.08)', borderRadius: 6, height: 24, marginLeft: 12, display: 'flex', alignItems: 'center', paddingLeft: 12, fontSize: 11, color: '#9ca3af' }}>ops-platform.app/dashboard</div>
          </div>
          {/* Mock dashboard content */}
          <div style={{ display: 'flex', height: 340 }}>
            {/* Sidebar mock */}
            <div style={{ width: 180, background: '#f8f9ff', borderRight: '1px solid rgba(99,102,241,0.1)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['Dashboard', 'CRM', 'Tasks', 'Invoices', 'Analytics', 'Integrations'].map((item, i) => (
                <div key={i} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: i === 0 ? 'white' : '#64748b', background: i === 0 ? 'linear-gradient(135deg, #4338ca, #6366f1)' : 'transparent', cursor: 'pointer' }}>
                  {item}
                </div>
              ))}
            </div>
            {/* Main mock content */}
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { label: 'Active Tasks', value: '142', color: '#4338ca' },
                  { label: 'Open Leads', value: '38', color: '#8b5cf6' },
                  { label: 'Revenue', value: '$84K', color: '#6366f1' },
                ].map((card, i) => (
                  <div key={i} style={{ flex: 1, background: '#f8f9ff', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(99,102,241,0.1)' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>{card.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, background: '#f8f9ff', borderRadius: 12, border: '1px solid rgba(99,102,241,0.1)', padding: '14px 16px', display: 'flex', alignItems: 'flex-end', gap: 6, overflow: 'hidden' }}>
                {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 10 || i === 11 ? 'linear-gradient(to top, #4338ca, #6366f1)' : 'rgba(99,102,241,0.15)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 999, background: 'rgba(99,102,241,0.08)', color: '#6366f1', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            Everything you need
          </div>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', color: '#1e1b4b', marginBottom: 14 }}>Everything in one workspace</h2>
          <p style={{ fontSize: 17, color: '#64748b', maxWidth: 500, margin: '0 auto' }}>Built around how real operations teams actually work.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {[
            { icon: CheckSquare, title: 'Task Management', desc: 'Kanban boards, deadlines, priorities, and team assignments. Full drag-and-drop sprint planning.', color: '#4338ca', bg: 'rgba(67,56,202,0.08)', href: '/dashboard' },
            { icon: Target, title: 'CRM Pipeline', desc: 'Visual lead pipeline with automated scoring, email sequences, and handoffs from marketing to sales.', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', href: '/crm' },
            { icon: FileText, title: 'Invoicing', desc: 'Generate GST invoices, track payment status, send reminders automatically on due dates.', color: '#6366f1', bg: 'rgba(99,102,241,0.08)', href: '/invoices' },
            { icon: BarChart3, title: 'Analytics & Reports', desc: 'Real-time dashboards for task completion, lead conversion, revenue, and team performance.', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', href: '/analytics' },
            { icon: Plug, title: 'Integrations', desc: 'Connect Gmail, WhatsApp (WATI), Razorpay, Zapier, and Cloudflare R2 storage.', color: '#4f46e5', bg: 'rgba(79,70,229,0.08)', href: '/integrations' },
            { icon: Users, title: 'Team Workflows', desc: 'Role-based access, approval chains, and collaborative notes across projects and teams.', color: '#6d28d9', bg: 'rgba(109,40,217,0.08)', href: '/settings' },
          ].map((f, i) => (
            <div
              key={i}
              onClick={() => router.push(f.href)}
              style={{ background: 'white', borderRadius: 16, padding: '28px', border: '1.5px solid rgba(99,102,241,0.1)', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 12px rgba(99,102,241,0.06)' }}
              onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 32px rgba(99,102,241,0.15)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.25)'; }}
              onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(99,102,241,0.06)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.1)'; }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <f.icon size={22} color={f.color} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e1b4b', marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.65, marginBottom: 18 }}>{f.desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: f.color }}>
                Open module <ChevronRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ROLES SECTION ── */}
      <section style={{ background: 'white', borderTop: '1px solid rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.1)', padding: '80px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', color: '#1e1b4b', marginBottom: 14 }}>Built for every role</h2>
            <p style={{ fontSize: 17, color: '#64748b' }}>Tailored dashboards and permissions for your entire team hierarchy.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { role: 'Admin', icon: Shield, desc: 'Full platform control, user management, billing, and compliance settings.', features: ['User provisioning', 'Audit logs', 'Billing & plans', 'Global settings'] },
              { role: 'Manager', icon: BarChart3, desc: 'Team oversight with approvals, pipeline control, and performance reports.', features: ['Team dashboards', 'Task approvals', 'Lead routing', 'KPI tracking'] },
              { role: 'Staff', icon: Users, desc: 'Task execution, updates, and collaboration tools for daily operations.', features: ['My tasks', 'Time tracking', 'Comments & notes', 'Client updates'] },
              { role: 'MR', icon: Target, desc: 'Field sales tools, lead capture, and visit logging built for on-the-go reps.', features: ['Lead capture', 'Visit log', 'Quote builder', 'WhatsApp CRM'] },
            ].map((r, i) => (
              <div key={i} style={{ background: 'linear-gradient(135deg, #f8f9ff 0%, #eef0fb 100%)', borderRadius: 16, padding: '28px 24px', border: '1.5px solid rgba(99,102,241,0.12)', transition: 'all 0.2s' }}
                onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.35)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(99,102,241,0.12)'; }}
                onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,0.12)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #4338ca, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                  <r.icon size={20} color="white" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#3730a3', marginBottom: 8 }}>{r.role}</div>
                <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>{r.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.features.map((feat, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={9} color="#4338ca" strokeWidth={3} />
                      </div>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCTION INTEGRATIONS / WORKFLOWS ── */}
      <section id="testimonials" style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', color: '#1e1b4b', marginBottom: 14 }}>High-Fidelity Operational Integrations</h2>
          <p style={{ fontSize: 17, color: '#64748b' }}>Every channel is fully functional and backed by real integrations.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { title: 'Gmail OAuth Integration', desc: 'Authorize secure Gmail access via official Google OAuth APIs to seamlessly sync incoming lead emails and compile automated outreach directly within sales pipelines.' },
            { title: 'WhatsApp Notification Gateway', desc: 'Dispatch instant task assignments, team shift check-ins, and automated client invoicing reminders directly to mobile numbers via meta-compliant WhatsApp Cloud APIs.' },
            { title: 'Razorpay Payment Gateway', desc: 'Generate secure transaction links for GST invoices, track payment status in real-time, and trigger automatic workflow progressions upon receipt of funds.' },
          ].map((t, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 16, padding: '28px', border: '1.5px solid rgba(99,102,241,0.1)', boxShadow: '0 2px 12px rgba(99,102,241,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3730a3', marginBottom: 12 }}>{t.title}</h3>
              <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.7, marginBottom: 0 }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ROLE ACCESS MATRIX / ARCHITECTURE ── */}
      <section id="architecture" style={{ background: 'white', borderTop: '1px solid rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.1)', padding: '80px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', color: '#1e1b4b', marginBottom: 14 }}>Role-Based Access Control</h2>
            <p style={{ fontSize: 17, color: '#64748b' }}>Every department has a tailored, secure workspace layout designed for their specific function.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 900, margin: '0 auto' }}>
            {[
              { plan: 'Operational Staff', price: 'Employee', period: ' Workspace', desc: 'Task check-ins, subtask logs, daily shift tracking, and real-time team direct messaging.', cta: 'Access Employee Desk', highlight: false, features: ['Daily shift timers', 'Live team presence search', 'Direct messaging with attachments', 'Sprint checklists'] },
              { plan: 'Department Lead', price: 'Manager', period: ' Dashboard', desc: 'Approve CRM workflows, oversee active team allocation, and review operational statistics.', cta: 'Access Manager Desk', highlight: true, features: ['Deal approval desk', 'Personnel management ranking', 'Live statistics charts', 'Priority support channels'] },
              { plan: 'Platform Control', price: 'System Admin', period: ' Panel', desc: 'Manage system-wide configurations, audit logs CRUD, and platform health.', cta: 'Access Admin Controls', highlight: false, features: ['Comprehensive audit trail', 'Create, suspend, or delete users', 'Maintenance mode configurations', 'System cache controls'] },
            ].map((p, i) => (
              <div key={i} style={{ position: 'relative', background: p.highlight ? 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)' : 'linear-gradient(135deg, #f8f9ff 0%, #eef0fb 100%)', borderRadius: 20, padding: '32px', border: p.highlight ? 'none' : '1.5px solid rgba(99,102,241,0.12)', boxShadow: p.highlight ? '0 12px 40px rgba(99,102,241,0.4)' : '0 2px 12px rgba(99,102,241,0.06)', transform: p.highlight ? 'scale(1.03)' : 'none', zIndex: p.highlight ? 1 : 0 }}>
                {p.highlight && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#92400e', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 99, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Recommended Role</div>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: p.highlight ? 'rgba(255,255,255,0.7)' : '#94a3b8', marginBottom: 16 }}>{p.plan}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: p.highlight ? 'white' : '#1e1b4b', letterSpacing: '-0.03em', marginBottom: 6, lineHeight: 1.1 }}>{p.price}<span style={{ fontSize: 14, fontWeight: 500, color: p.highlight ? 'rgba(255,255,255,0.6)' : '#94a3b8' }}>{p.period}</span></div>
                <p style={{ fontSize: 13, color: p.highlight ? 'rgba(255,255,255,0.75)' : '#64748b', marginBottom: 24, lineHeight: 1.6 }}>{p.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.features.map((feat, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: p.highlight ? 'rgba(255,255,255,0.85)' : '#475569' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: p.highlight ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={10} color={p.highlight ? 'white' : '#4338ca'} strokeWidth={3} />
                      </div>
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link href="/login" style={{ textDecoration: 'none', display: 'block', width: '100%', padding: '12px 0', fontWeight: 700, borderRadius: 12, textAlign: 'center', fontSize: 14, background: p.highlight ? 'white' : 'linear-gradient(135deg, #4338ca, #6366f1)', color: p.highlight ? '#4338ca' : 'white', boxShadow: p.highlight ? 'none' : '0 4px 14px rgba(99,102,241,0.3)', transition: 'all 0.2s' }}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px' }}>
        <div style={{ position: 'relative', background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #8b5cf6 100%)', borderRadius: 24, padding: '64px', textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 300, height: 300, background: 'rgba(255,255,255,0.05)', borderRadius: '50%', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -60, width: 250, height: 250, background: 'rgba(255,255,255,0.05)', borderRadius: '50%', pointerEvents: 'none' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
            <Zap size={11} fill="white" color="white" /> Secure Workspace Access
          </div>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', marginBottom: 16, position: 'relative' }}>Ready to run better operations?</h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.75)', marginBottom: 36, position: 'relative' }}>Sign in to access your role-based control dashboard panel.</p>
          <Link href="/login" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 40px', background: 'white', color: '#4338ca', fontWeight: 800, borderRadius: 14, fontSize: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.2)', transition: 'all 0.2s', position: 'relative' }}>
            Sign In to Workspace <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(99,102,241,0.1)', background: 'white', padding: '56px 32px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 40, flexWrap: 'wrap', marginBottom: 48 }}>
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #4338ca, #6366f1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={18} color="white" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#3730a3' }}>Ops Platform</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#6366f1', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Enterprise Operations</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>End-to-end operations management for teams that need clarity, speed, and scale.</p>
          </div>
          <div style={{ display: 'flex', gap: 64, flexWrap: 'wrap' }}>
            {[
              { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'Role Access', href: '#architecture' }, { label: 'Dashboard', href: '/login' }] },
              { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Contact', href: '#' }] },
            ].map((col, i) => (
              <div key={i}>
                <h4 style={{ fontWeight: 700, fontSize: 13, color: '#1e1b4b', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.title}</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {col.links.map((l, j) => (
                    <li key={j}>
                      <a href={l.href} style={{ textDecoration: 'none', fontSize: 13.5, color: '#64748b', transition: 'color 0.2s' }} onMouseOver={e => (e.currentTarget.style.color = '#4338ca')} onMouseOut={e => (e.currentTarget.style.color = '#64748b')}>{l.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: '0 auto', paddingTop: 24, borderTop: '1px solid rgba(99,102,241,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#cbd5e1' }}>© 2026 Ops Platform. All rights reserved.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
            <span style={{ width: 7, height: 7, background: '#22c55e', borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            All systems operational
          </div>
        </div>
      </footer>
    </div>
  );
}
