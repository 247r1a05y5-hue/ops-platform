'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Flag, Trash2, CheckCircle2, Download, AlertTriangle, MessageSquare, BarChart3, RefreshCw } from 'lucide-react';

interface FlaggedMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  flagReason: string;
  flaggedBy: string | null;
}

interface Conversation {
  _id: string;
  name: string;
  type: string;
  lastMessage: string;
}

export default function AdminChatPage() {
  const [flagged, setFlagged] = useState<FlaggedMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingFlagged, setLoadingFlagged] = useState(true);
  const [loadingConvs, setLoadingConvs] = useState(true);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportConvId, setExportConvId] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');

  // Load flagged messages
  const fetchFlagged = useCallback(async () => {
    setLoadingFlagged(true);
    try {
      const res = await fetch('/api/chat/admin/flagged');
      const data = await res.json();
      if (data.success) {
        setFlagged(data.messages);
      }
    } catch (err) {
      console.error('[Admin Chat Flagged]', err);
    } finally {
      setLoadingFlagged(false);
    }
  }, []);

  // Load conversations list for export dropdown
  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch('/api/chat/conversations');
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations);
        if (data.conversations.length > 0) {
          setExportConvId(data.conversations[0]._id);
        }
      }
    } catch (err) {
      console.error('[Admin Chat Convs]', err);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => {
    fetchFlagged();
    fetchConversations();
  }, [fetchFlagged, fetchConversations]);

  // Moderation actions
  const handleModerate = async (messageId: string, action: 'unflag' | 'delete') => {
    if (action === 'delete' && !confirm('Are you sure you want to permanently delete this message?')) return;
    try {
      const res = await fetch('/api/chat/admin/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setFlagged(prev => prev.filter(m => m._id !== messageId));
        setSelectedIds(prev => prev.filter(id => id !== messageId));
      }
    } catch (err) {
      console.error('[Moderation Action]', err);
    }
  };

  // Bulk moderation
  const handleBulkModerate = async (action: 'unflag' | 'delete') => {
    if (selectedIds.length === 0) return;
    if (action === 'delete' && !confirm(`Are you sure you want to permanently delete these ${selectedIds.length} messages?`)) return;
    
    // Process items in parallel
    const promises = selectedIds.map(messageId => 
      fetch('/api/chat/admin/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, action }),
      }).then(r => r.json())
    );

    try {
      await Promise.all(promises);
      setFlagged(prev => prev.filter(m => !selectedIds.includes(m._id)));
      setSelectedIds([]);
    } catch (err) {
      console.error('[Bulk Moderation]', err);
    }
  };

  // Checkbox selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === flagged.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(flagged.map(m => m._id));
    }
  };

  // Export CSV/JSON trigger
  const handleExport = () => {
    if (!exportConvId) return;
    const url = `/api/chat/export?conversationId=${exportConvId}&format=${exportFormat}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `chat-export-${exportConvId}-${Date.now()}.${exportFormat}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="view-container active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '18px', margin: 0 }}>Chat Moderation & Administration</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Review flagged messages, moderate content, and export chat archives.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => { fetchFlagged(); fetchConversations(); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid-3" style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px' }}>
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '12px' }}>
            <Flag size={20} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{flagged.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pending Flagged Messages</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px' }}>
          <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', padding: '12px', borderRadius: '12px' }}>
            <MessageSquare size={20} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{conversations.length}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Active Conversations</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px' }}>
          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '12px', borderRadius: '12px' }}>
            <BarChart3 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>Active</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Workspace Status</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Flagged Messages Section */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Flagged Message Queue</h3>
            {selectedIds.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => handleBulkModerate('unflag')} 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <CheckCircle2 size={12} /> Dismiss Selected
                </button>
                <button 
                  onClick={() => handleBulkModerate('delete')} 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '11px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Trash2 size={12} /> Delete Selected
                </button>
              </div>
            )}
          </div>

          {loadingFlagged ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
              Loading flagged queue...
            </div>
          ) : flagged.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
              <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 12px auto' }} />
              <div style={{ fontWeight: 600 }}>No flagged messages</div>
              <div style={{ fontSize: '12px' }}>Workspace content is clear!</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px', width: '32px' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === flagged.length} 
                        onChange={toggleSelectAll} 
                      />
                    </th>
                    <th style={{ padding: '10px 8px', fontWeight: 600 }}>Sender</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600 }}>Message Content</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600 }}>Flag Reason</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, width: '120px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map(msg => (
                    <tr key={msg._id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px 8px' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(msg._id)} 
                          onChange={() => toggleSelect(msg._id)} 
                        />
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                        {msg.senderName}
                        <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--text-primary)', wordBreak: 'break-word', maxWidth: '240px' }}>
                        {msg.body}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600 }}>
                          <AlertTriangle size={10} /> {msg.flagReason || 'Unspecified'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleModerate(msg._id, 'unflag')}
                            style={{ border: 'none', background: 'none', color: '#10b981', cursor: 'pointer', padding: '4px' }}
                            title="Dismiss flag"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button
                            onClick={() => handleModerate(msg._id, 'delete')}
                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                            title="Delete message"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Administration Actions & Archives Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Archives / Export Card */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600 }}>Chat Archives</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Export the entire history of any chat conversation for compliance or backup.
            </p>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label" style={{ fontSize: '11px' }}>Select Conversation</label>
              {loadingConvs ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Loading chats...</div>
              ) : (
                <select
                  value={exportConvId}
                  onChange={(e) => setExportConvId(e.target.value)}
                  className="form-control"
                  style={{ fontSize: '12px', width: '100%', height: '36px', borderRadius: '8px', border: '1px solid var(--border)', padding: '0 8px' }}
                >
                  {conversations.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ fontSize: '11px' }}>Export Format</label>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 600 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="format" 
                    value="csv" 
                    checked={exportFormat === 'csv'} 
                    onChange={() => setExportFormat('csv')} 
                  />
                  CSV (Excel friendly)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="format" 
                    value="json" 
                    checked={exportFormat === 'json'} 
                    onChange={() => setExportFormat('json')} 
                  />
                  JSON
                </label>
              </div>
            </div>

            <button 
              onClick={handleExport} 
              disabled={!exportConvId}
              className="btn btn-primary" 
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Download size={14} /> Export Archive
            </button>
          </div>

          {/* Usage Chart/Stats Card */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600 }}>Activity Statistics</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Real-time visualization of chat volumes across the workspace.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 600, marginBottom: '4px' }}>
                  <span>General Channel</span>
                  <span>78% volume</span>
                </div>
                <div style={{ height: '8px', backgroundColor: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '78%', backgroundColor: '#4f46e5', borderRadius: '4px' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 600, marginBottom: '4px' }}>
                  <span>CRM Lead Channels</span>
                  <span>42% volume</span>
                </div>
                <div style={{ height: '8px', backgroundColor: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '42%', backgroundColor: '#10b981', borderRadius: '4px' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 600, marginBottom: '4px' }}>
                  <span>Direct Messages (DMs)</span>
                  <span>25% volume</span>
                </div>
                <div style={{ height: '8px', backgroundColor: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '25%', backgroundColor: '#f59e0b', borderRadius: '4px' }} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
