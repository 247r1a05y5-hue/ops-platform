'use client';
import { useState } from 'react';

export default function Admin() {
    const [auditLogQuery, setAuditLogQuery] = useState('');

    const handleClearCache = () => {
        alert('Server cache cleared successfully.');
    };

    const handleSearchAudit = (e: React.FormEvent) => {
        e.preventDefault();
        alert(`Searching audit log for: ${auditLogQuery}`);
    };

    return (
        <div className="view-container active">
            <h2 style={{ fontSize: '18px', marginBottom: '24px' }}>System Admin Panel</h2>
            <div className="grid-2">
                <div className="card">
                    <h3 style={{ marginBottom: '20px' }}>Global Settings</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>Maintenance Mode</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Disable access to non-admin users.</div>
                            </div>
                            <button className="btn btn-secondary">Enable</button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>System Cache</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Last cleared: 2 hours ago</div>
                            </div>
                            <button className="btn btn-primary" onClick={handleClearCache}>Clear Cache</button>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: '20px' }}>Audit Log Query</h3>
                    <form onSubmit={handleSearchAudit}>
                        <div className="form-group">
                            <label className="form-label">Action / User ID</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                placeholder="Search logs..." 
                                value={auditLogQuery}
                                onChange={(e) => setAuditLogQuery(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn btn-secondary" style={{ width: '100%' }}>Run Query</button>
                    </form>
                </div>
            </div>
        </div>
    );
}
