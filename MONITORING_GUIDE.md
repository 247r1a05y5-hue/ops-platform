# MONITORING_GUIDE.md — Production Monitoring Guide

## Operational Metrics
1. **Node.js Process Health**: Track CPU Load, Memory usage (Heap limit alerts at 85%), and event loop delays.
2. **API Endpoint Latency**: Monitor response times (alert on HTTP 500 spikes or mean latency > 1.5s).
3. **Database Performance**: Track Atlas connection pool count, read/write IOPS, and slow queries.
4. **WebSocket Session Count**: Track active Socket.IO connections.

## Tools & Alerts
* **L1 Monitoring**: `/health` endpoint checked every 60 seconds via automated uptime monitor (e.g. UptimeRobot / Pingdom).
* **Application Logs**: Monitored via Railway Log Explorer or structured logging integrations.
* **Database Alerts**: MongoDB Atlas metrics alerts on memory utilization and disk space limits.
* **Notification Warnings**: Monitor Brevo API delivery errors in `EmailLog` collections.
