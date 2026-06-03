'use client';

import React, { useRef, useState } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { X, Maximize2, Minimize2 } from 'lucide-react';

interface JitsiCallProps {
  roomName: string;
  userName: string;
  userEmail: string;
  onEnd: () => void;
}

export default function JitsiCall({ roomName, userName, userEmail, onEnd }: JitsiCallProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const iceServers = {
    replace: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
  };

  return (
    <div 
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#09090e',
        position: 'relative',
        borderRadius: isFullscreen ? 0 : 16,
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'rgba(20, 20, 30, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 10,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span 
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 8px #22c55e',
              animation: 'ringPulse 1.5s infinite',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
            Video Call Room: {roomName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          {/* Close Modal Button */}
          <button
            onClick={onEnd}
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: 'none',
              borderRadius: '50%',
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; }}
            title="Leave Call"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Jitsi Meeting View Container */}
      <div style={{ flex: 1, paddingTop: 58, height: 'calc(100% - 58px)', position: 'relative' }}>
        <JitsiMeeting
          domain="meet.jit.si"
          roomName={roomName}
          configOverwrite={{
            iceServers,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
            enableClosePage: false,
            disableAudioLevels: false,
            useStunTurn: true,
            enableNoAudioDetection: true,
            enableNoisyMicDetection: true,
            p2p: {
              enabled: true,
              preferH264: true,
              useStunTurn: true,
            },
          }}
          interfaceConfigOverwrite={{
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'closedcaptions', 'desktop', 'embedmeeting', 'fullscreen',
              'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
              'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
              'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
              'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
              'security'
            ],
          }}
          userInfo={{
            displayName: userName,
            email: userEmail,
          }}
          onApiReady={(externalApi) => {
            console.info('[Jitsi] iframe ready', { roomName, userName });

            externalApi.addEventListener('videoConferenceJoined', () => {
              console.info('[Jitsi] videoConferenceJoined', { roomName });
            });
            externalApi.addEventListener('participantJoined', (...args: any[]) => {
              console.info('[Jitsi] participantJoined', args);
            });
            externalApi.addEventListener('participantLeft', (...args: any[]) => {
              console.info('[Jitsi] participantLeft', args);
            });
            externalApi.addEventListener('audioMuteStatusChanged', (...args: any[]) => {
              console.info('[Jitsi] audioMuteStatusChanged', args);
            });
            externalApi.addEventListener('videoMuteStatusChanged', (...args: any[]) => {
              console.info('[Jitsi] videoMuteStatusChanged', args);
            });
            externalApi.addEventListener('iceConnectionStateChange', (...args: any[]) => {
              console.info('[Jitsi] ICE connection state', args);
            });
            externalApi.addEventListener('peerConnectionStateChange', (...args: any[]) => {
              console.info('[Jitsi] peer connection state', args);
            });
            externalApi.addEventListener('videoConferenceLeft', () => {
              console.info('[Jitsi] videoConferenceLeft', { roomName });
              onEnd();
            });
          }}
          getIFrameRef={(iframeRef) => {
            const iframe = iframeRef as HTMLIFrameElement;
            iframe.style.height = '100%';
            iframe.style.width = '100%';
            iframe.style.border = 'none';
            iframe.allow = 'camera; microphone; display-capture; autoplay; clipboard-write; encrypted-media; fullscreen';
          }}
        />
      </div>
    </div>
  );
}
