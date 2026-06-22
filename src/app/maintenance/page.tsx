'use client';

import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at center, #1e1b4b 0%, #09090b 100%)',
      color: '#f4f4f5',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '24px',
      textAlign: 'center'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '48px 32px',
        maxWidth: '480px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '20px',
          background: 'rgba(239, 68, 68, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <ShieldAlert style={{ width: '32px', height: '32px', color: '#ef4444' }} />
        </div>
        
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          marginBottom: '12px',
          letterSpacing: '-0.025em',
          background: 'linear-gradient(to right, #f4f4f5, #a1a1aa)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          System Maintenance
        </h1>
        
        <p style={{
          fontSize: '15px',
          color: '#a1a1aa',
          lineHeight: '1.6',
          marginBottom: '32px'
        }}>
          Our engineers are performing scheduled system upgrades. Access for non-admin accounts is temporarily restricted to ensure database safety.
        </p>

        <button 
          onClick={() => window.location.reload()} 
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#4f46e5',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            outline: 'none'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
        >
          <RefreshCw style={{ width: '16px', height: '16px' }} />
          Retry Connection
        </button>
      </div>
    </div>
  );
}
