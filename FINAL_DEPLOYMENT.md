# FINAL_DEPLOYMENT.md — Enterprise Production Deployment

## Platform Stack
* **Runtime**: Node.js v18+ (tested on v20)
* **Framework**: Next.js v16.2.5 (App Router with Turbopack compiler)
* **Web Server**: Custom HTTP/WebSocket Server (`server.mjs`)
* **Real-time Engine**: Socket.IO v4.8.1
* **Database**: MongoDB (Atlas) with Mongoose ORM

## Build & Start Sequence
1. Ensure all environment variables are correctly injected into the environment.
2. Compile production bundle:
   ```bash
   npm run build
   ```
3. Boot the application:
   ```bash
   npm run start
   ```

## Production Configurations
* Custom server binds to `0.0.0.0` at `$PORT`.
* Socket.IO is mounted at path `/api/socketio` supporting websocket transport upgrades.
