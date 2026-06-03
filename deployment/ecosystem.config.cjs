/**
 * deployment/ecosystem.config.cjs
 *
 * PM2 process manager config for the OPS Platform on VPS.
 * Uses .cjs extension because package.json has "type": "module".
 *
 * Usage:
 *   pm2 start deployment/ecosystem.config.cjs
 *   pm2 reload deployment/ecosystem.config.cjs   # zero-downtime reload
 *   pm2 save                                      # persist across reboots
 *   pm2 startup                                   # auto-start on boot
 */

module.exports = {
  apps: [
    {
      name: 'ops-platform',
      script: './server.mjs',

      // Run 1 instance — Socket.IO state is in-process memory.
      // For multi-instance scaling, you would need Redis adapter.
      instances: 1,

      // Restart policy
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Graceful shutdown — allow 10s for in-flight requests
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 15000,

      // Environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Logging
      out_file: '/var/log/ops/out.log',
      error_file: '/var/log/ops/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Node.js flags
      node_args: '--max-old-space-size=512',
    },
  ],
};
