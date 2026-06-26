# ROLLBACK_PLAN.md — Deployment Rollback Strategy

## Triggers for Rollback
- Build failures during deploy.
- Severe HTTP 5xx errors or network timeout cascades on go-live.
- Memory leaks or CPU exhaustion spikes post-deployment.
- Data corruption issues in MongoDB due to database driver or serialization bugs.

## Step-by-Step Rollback Procedure
1. **Identify the Last Stable Release Tag**:
   Identify the previous git release tag (e.g. `v0.9.0` or git reference prior to `v1.0.0`).
2. **Revert Deployment in CI/CD**:
   - On Railway: Re-deploy the last successful deployment commit from the dashboard.
   - Using Git:
     ```bash
     git checkout <last-stable-tag-or-hash>
     git tag -d v1.0.0
     # Rebuild and run
     npm run build
     npm run start
     ```
3. **Validate Restored Operations**:
   - Hit `/health` to ensure return is healthy status.
   - Verify WebSocket connections are re-established.
4. **Post-Mortem**:
   Collect error logs from deployment log stream prior to rebuild.
