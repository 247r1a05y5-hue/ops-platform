# BACKUP_RECOVERY.md — Database Backup & Recovery Plan

## Backup Strategy
* **Automated Snapshots**: Daily continuous backup snapshots configured on MongoDB Atlas cluster.
* **Point-in-Time Recovery**: Enabled on Atlas cluster for 7-day retention.
* **Manual Backups**: Prior to major releases or migrations, run `mongodump`:
  ```bash
  mongodump --uri="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<database>" --out=./backups/backup-$(date +%F)
  ```

## Disaster Recovery Procedure
1. Locate the latest validated dump or snapshot.
2. In case of database outage, create/provision a recovery cluster.
3. Import the backup dump:
  ```bash
  mongorestore --uri="mongodb+srv://<user>:<password>@<new-cluster>.mongodb.net/<database>" ./backups/backup-<date>/
  ```
4. Verify schema constraints and re-build indexes:
  ```javascript
  // run in mongo shell
  db.leads.createIndex({ assignedTo: 1 });
  db.workspaces.createIndex({ slug: 1 }, { unique: true });
  ```
5. Re-point environment variable `MONGODB_URI` to the recovery cluster.
