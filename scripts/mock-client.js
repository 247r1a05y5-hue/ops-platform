import axios from 'axios';
import { io } from 'socket.io-client';

const host = 'http://localhost:3000';

async function main() {
  console.log('[Mock Client] Logging in as manager@ops.com...');
  try {
    const loginRes = await axios.post(`${host}/api/auth/login`, {
      email: 'manager@ops.com',
      password: 'manager123'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const cookieHeader = loginRes.headers['set-cookie'];
    if (!cookieHeader) {
      throw new Error('No Set-Cookie header returned');
    }
    const cookie = cookieHeader[0].split(';')[0];
    console.log('[Mock Client] Login successful. Session cookie obtained.');

    const sendRes = await axios.get(`${host}/api/chat/send`, {
      headers: {
        Cookie: cookie
      }
    });
    const token = sendRes.data.token;
    if (!token) {
      throw new Error('Could not retrieve JWT token');
    }
    console.log('[Mock Client] JWT token retrieved.');

    console.log('[Mock Client] Connecting to Socket.IO server...');
    const socket = io(host, {
      path: '/api/socketio',
      auth: { token },
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log(`[Mock Client] Connected to socket! ID: ${socket.id}`);
      // Join conversation room if a conversation ID is provided
      const convIdArg = process.argv.find(arg => arg.startsWith('--conv='));
      if (convIdArg) {
        const convId = convIdArg.split('=')[1];
        console.log(`[Mock Client] Joining conversation conv:${convId}`);
        socket.emit('join_conversation', convId);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Mock Client] Socket disconnected: ${reason}`);
    });

    socket.on('chat_event', (payload) => {
      console.log(`[Mock Client] Received event:`, JSON.stringify(payload, null, 2));

      if (payload.type === 'vid_signal') {
        const { subtype, from, fromName, conversationId } = payload;
        console.log(`[Mock Client] Call signal [${subtype}] from ${fromName} (${from})`);

        if (subtype === 'ring') {
          if (process.argv.includes('--decline')) {
            console.log('[Mock Client] Declining call in 2 seconds...');
            setTimeout(() => {
              socket.emit('signal', {
                type: 'reject',
                targetUserId: from,
                conversationId
              });
              console.log('[Mock Client] Sent reject signal');
            }, 2000);
          } else if (process.argv.includes('--busy')) {
            console.log('[Mock Client] Rejecting call as busy in 2 seconds...');
            setTimeout(() => {
              socket.emit('signal', {
                type: 'reject',
                targetUserId: from,
                conversationId,
                reason: 'busy'
              });
              console.log('[Mock Client] Sent reject (busy) signal');
            }, 2000);
          } else {
            console.log('[Mock Client] Accepting call in 3 seconds...');
            setTimeout(() => {
              socket.emit('signal', {
                type: 'answer',
                targetUserId: from,
                conversationId
              });
              console.log('[Mock Client] Sent answer signal');
            }, 3000);
          }
        } else if (subtype === 'hangup') {
          console.log('[Mock Client] Remote user hung up.');
        }
      }
    });

    // Start heartbeat
    setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat');
      }
    }, 15000);

  } catch (err) {
    console.error('[Mock Client] Error:', err.message);
    if (err.response) {
      console.error('[Mock Client] Response Data:', err.response.data);
    }
  }
}

main();
