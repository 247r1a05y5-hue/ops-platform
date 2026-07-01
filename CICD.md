# OPS Platform — CI/CD & Operations Manual

This guide describes the containerization, continuous integration, and continuous delivery architecture of the CRM platform. It provides developers and platform operations team members with step-by-step instructions on running tests, container builds, pipeline updates, and live deployments.

---

## 🚀 1. Local Development & Testing

### Running the Project Locally
Ensure dependencies are installed and boot the custom development server (which embeds both Next.js and the Socket.io real-time layer):
```bash
# Install dependencies
npm install

# Start the dev server (includes Socket.io and hot reloading)
npm run dev
```

### Executing the Testing Suite
Verify codebase health by running unit, integration, and E2E browser tests:
```bash
# Run Unit Tests (Isolated modules and helpers)
npm run test:unit

# Run Integration Tests (Next.js route handlers with in-memory MongoDB)
npm run test:integration

# Run Playwright E2E Browser Tests (Simulates actual user logins & Kanban board operations)
npm run test:e2e
```

---

## 🐳 2. Docker Architecture

We use a **multi-stage build** (`Dockerfile`) to compile the application and prepare a hardened, lightweight image for production.

### Building the Docker Image Locally
```bash
docker build -t ops-crm:latest .
```

### Running the Docker Container Locally
Execute the containerized application while injecting the required database and secret environment variables:
```bash
docker run -d \
  -p 3000:3000 \
  --name ops-crm-container \
  -e NODE_ENV=production \
  -e MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/ops-db" \
  -e JWT_SECRET="super-secure-jwt-secret-min-32-characters" \
  -e ADMIN_EMAIL="admin@ops.com" \
  -e SENDER_EMAIL="admin@ops.com" \
  -e CRON_SECRET="cron-job-trigger-secret-key" \
  ops-crm:latest
```

### Verifying Container Health
The container is configured with a health check that queries the `/api/auth/me` endpoint every 30 seconds. To query the container's health state:
```bash
docker inspect --format='{{json .State.Health}}' ops-crm-container
```

---

## 🛠️ 3. CI/CD Workflows (GitHub Actions)

Two pipelines are configured in `.github/workflows/`:

### A. Pull Request Verification (`ci.yml`)
Runs on every Pull Request targeting the `main` branch:
1. Installs npm dependencies using runner cache.
2. Checks TypeScript type compile safety (`tsc --noEmit`).
3. Runs ESLint checks (`npm run lint`).
4. Performs an npm vulnerability audit (configured to fail on **High** and **Critical** issues).
5. Scans files for hardcoded private keys or secrets (fails if private keys or secret values are found).
6. Executes all unit and integration tests.
7. Performs a production compiler build.

### B. Continuous Delivery & Docker Publish (`cd.yml`)
Runs on push/merge to the `main` branch or when a release tag (`v*`) is pushed:
1. Re-executes type checks, lint checks, and testing suites.
2. Performs a **local Docker build and container smoke test**: starts the container inside the GitHub runner and waits for the health check to pass successfully.
3. Automatically authenticates with **GitHub Container Registry (GHCR)**.
4. Generates tags:
   - `latest`
   - Git Commit SHA (e.g. `sha-4ef32a8...`)
   - Semantic Version (e.g. `v1.2.0`, if triggered by a release tag).
5. Publishes the built production image to `ghcr.io`.

---

## 🔐 4. Required Repository Secrets

To enable GitHub Actions and third-party platform deployments, configure the following secrets under **Settings > Secrets and Variables > Actions**:

| Secret Name | Description | Required For |
|-------------|-------------|--------------|
| `MONGODB_URI` | Production MongoDB Connection String | Integration tests & build verification |
| `JWT_SECRET` | Secret key used to sign sessions (min 32 chars) | Build verification & runtime |
| `ADMIN_EMAIL` | Default administrator account email | Setup checks & seeding |
| `SENDER_EMAIL` | Default outgoing SMTP sender address | Notifications & alerts |
| `CRON_SECRET` | Endpoint protection key for cron triggers | System workers & webhooks |

*Note: GitHub Container Registry publishing uses the default `${{ secrets.GITHUB_TOKEN }}` generated dynamically by the action, so you do **not** need to configure Docker Hub or GHCR registry credentials manually.*

---

## 🌐 5. Deployment Options

### Option A: Railway Deployment
Railway uses the root `railway.toml` file automatically.
1. Connect your repository to Railway.
2. In the Railway dashboard under **Variables**, add all required environment variables (`MONGODB_URI`, `JWT_SECRET`, etc.).
3. Railway will build using the `nixpacks` builder and run `node server.mjs`.

### Option B: Render Deployment
Render utilizes the [render.yaml](file:///c:/Users/vaish/Music/ops/ops/ops%20final/render.yaml) blueprint file.
1. Go to the Render dashboard.
2. Click **New > Blueprint**.
3. Select your repository. Render will automatically parse `render.yaml` and provision a Docker web service using the `Dockerfile`.
4. Enter the required secrets in the Render dashboard UI.

### Option C: VPS / Self-Hosted Docker Compose
For hosting on a Virtual Private Server (VPS) or cloud VM:
1. Install Docker and Docker Compose on the host.
2. Clone/copy [docker-compose.yml](file:///c:/Users/vaish/Music/ops/ops/ops%20final/docker-compose.yml) and your `.env` file to the server.
3. Spin up the container:
   ```bash
   docker compose up -d
   ```
4. View container logs:
   ```bash
   docker compose logs -f
   ```

---

## 🔄 6. Rollback Guidance

If a production deployment fails or exhibits degradation:

### 1. Rolling Back Image on Docker Compose / VPS
Update the tag in your docker compose configuration to reference the previous known good Git SHA, and restart:
```bash
# Example rollback to previous SHA
docker compose pull ghcr.io/<org>/ops-crm:sha-9f8e7d6c...
docker compose up -d
```

### 2. Rolling Back on Railway / Render
1. Go to the platform dashboard (Railway or Render).
2. Open the **Deployments** or **History** tab.
3. Select the previous successful deployment.
4. Click **Redeploy** or **Rollback**. The platform will immediately reactivate the previous build container.
