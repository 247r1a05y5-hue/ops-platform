# GitHub Repository Setup - Step by Step

This guide walks you through creating a GitHub repository and pushing the OPS Platform code.

## Prerequisites

- GitHub account (https://github.com)
- Git installed locally
- SSH key configured (or use HTTPS with personal access token)

---

## Step 1: Create GitHub Repository

### Option A: Create via GitHub Web Interface

1. Go to https://github.com/new
2. **Repository name**: `ops-platform` (or your preferred name)
3. **Description**: "Integrated operations management SaaS platform with real-time chat, CRM, and project management"
4. **Visibility**: Choose based on your needs:
   - **Public**: Anyone can see (good for portfolios)
   - **Private**: Only invited users can see (recommended for production)
5. **Initialize repository**: 
   - ❌ Do NOT check "Add a README file"
   - ❌ Do NOT check "Add .gitignore"
   - ❌ Do NOT check "Add a license"
   - (We already have these configured locally)
6. Click **"Create repository"**

### Option B: Create via GitHub CLI

```bash
# Install GitHub CLI if not already installed
# Windows: choco install gh
# Mac: brew install gh
# Linux: sudo apt install gh

# Authenticate with GitHub
gh auth login

# Create repository
gh repo create ops-platform \
  --private \
  --source=. \
  --remote=origin \
  --push
```

---

## Step 2: Add Remote Origin

After creating the repository on GitHub, add it as the remote:

```bash
# Navigate to project
cd "c:\Users\vaish\Music\ops-socketio000000000000000000000000000000000000000\ops-socketio-updated\ops"

# Add remote (replace YOUR_USERNAME with your actual GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/ops-platform.git

# Verify remote was added
git remote -v
# Should show:
# origin  https://github.com/YOUR_USERNAME/ops-platform.git (fetch)
# origin  https://github.com/YOUR_USERNAME/ops-platform.git (push)
```

---

## Step 3: Configure GitHub Authentication

### Option A: Use HTTPS with Personal Access Token (Recommended for beginners)

1. Go to GitHub Settings → [Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Configure token:
   - **Token name**: "OPS Platform Git Push"
   - **Expiration**: 90 days (or as per your policy)
   - **Scopes**: Select `repo` (full control of private repositories)
4. Click "Generate token"
5. **Copy the token** (you won't see it again!)
6. When git asks for password during push, paste this token

### Option B: Use SSH (More secure, recommended for production)

1. Generate SSH key (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   # Press Enter for default location
   # Set a passphrase (optional but recommended)
   ```

2. Add SSH key to GitHub:
   - Go to GitHub Settings → [SSH and GPG keys](https://github.com/settings/keys)
   - Click "New SSH key"
   - Title: "OPS Platform Laptop"
   - Key: Paste contents of `~/.ssh/id_ed25519.pub`
   - Click "Add SSH key"

3. Update remote URL to use SSH:
   ```bash
   git remote set-url origin git@github.com:YOUR_USERNAME/ops-platform.git
   ```

---

## Step 4: Push Code to GitHub

### Initial Push

Push your local repository to GitHub:

```bash
# Push all branches and tags
git push -u origin master

# Output should show:
# Enumerating objects: 162, done.
# Counting objects: 100% (162/162), done.
# ...
# * [new branch]      master -> master
# Branch 'master' set up to track remote branch 'master' from 'origin'.
```

If you get a prompt for credentials:
- **Username**: Your GitHub username
- **Password**: Your personal access token (or SSH passphrase)

### Verify Push

1. Go to your GitHub repository: `https://github.com/YOUR_USERNAME/ops-platform`
2. You should see all 162 files:
   - `package.json`
   - `server.mjs`
   - `DEPLOYMENT.md`
   - `README.md`
   - All source files in `src/`
   - All configuration files

3. Verify sensitive files are NOT committed:
   ```bash
   # Check that .env.local is ignored
   git ls-files | grep env
   # Should only show: .env.example
   
   # Verify node_modules is ignored
   git ls-files | grep node_modules
   # Should return nothing
   ```

---

## Step 5: Verify Repository Health

### Check Repository on GitHub

1. Click the "Code" button to see clone options
2. Verify branch protection (optional but recommended):
   - Go to Settings → Branches
   - Add rule for `master`:
     - Require pull request reviews before merging
     - Require status checks to pass
     - Dismiss stale pull request approvals

### Create a `.github/workflows/` for CI/CD (Optional)

```bash
# Create directory
mkdir -p .github/workflows

# Create build workflow (optional)
cat > .github/workflows/build.yml << 'EOF'
name: Build & Test
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run lint
      - run: npm run build
EOF

git add .github/workflows/build.yml
git commit -m "Add GitHub Actions CI/CD workflow"
git push origin master
```

---

## Step 6: Clone & Test Clean Installation

Test that another machine can successfully clone and build the project:

### From a different directory:

```bash
# Create a test directory
mkdir ~/ops-test
cd ~/ops-test

# Clone the repository
git clone https://github.com/YOUR_USERNAME/ops-platform.git
cd ops-platform/ops

# Verify essential files exist
ls -la | grep -E "(package.json|server.mjs|DEPLOYMENT.md|README.md|.env.example)"

# Install dependencies
npm install

# Verify build
npm run build

# Check build output
ls -la .next | head
```

### Expected Output

If successful:
```
✓ All source files present
✓ Dependencies installed (~400MB)
✓ .env.local is NOT present (good - secrets protected)
✓ node_modules is NOT in git (good - in .gitignore)
✓ Build completes without errors
✓ .next/ folder created with optimized build
```

---

## Step 7: Configure for Deployment Services

### For Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign up if needed
3. Click "New Project"
4. Click "Import Git Repository"
5. Paste GitHub repo URL: `https://github.com/YOUR_USERNAME/ops-platform`
6. Authorize Vercel to access your GitHub account
7. Select the repository
8. Configure:
   - Framework: **Next.js**
   - Root Directory: **ops/**
   - Build Command: **npm run build**
   - Output Directory: **.next**
9. Add environment variables (from `.env.example`)
10. Click "Deploy"

### For Railway

1. Go to [railway.app](https://railway.app)
2. Sign up if needed
3. Click "New Project" → "Deploy from GitHub"
4. Connect GitHub account
5. Select the repository
6. Configure:
   - Root Directory: **ops/**
7. Railway auto-detects `railway.toml` and configures automatically
8. Add environment variables
9. Deploy automatically starts

---

## Step 8: Set Up Branch Protection (Recommended)

Prevent accidental pushes to main branch:

```bash
# GitHub Settings → Branches → Add Rule

Rule name: master
☑ Require a pull request before merging
☑ Require status checks to pass before merging
☑ Require branches to be up to date before merging
☑ Require code reviews before merging
☑ Require review from Code Owners
```

---

## Future Development Workflow

After initial setup, use this workflow:

### 1. Create a feature branch:
```bash
git checkout -b feature/chat-improvements
# or
git checkout -b fix/socket-connection-timeout
```

### 2. Make changes and commit:
```bash
git add .
git commit -m "Add chat typing indicators"
```

### 3. Push to GitHub:
```bash
git push origin feature/chat-improvements
```

### 4. Create a Pull Request:
- Go to GitHub repository
- Click "Compare & pull request"
- Add description of changes
- Submit PR

### 5. Merge after review:
```bash
# After approval, merge on GitHub (or locally):
git checkout master
git pull origin master
git merge feature/chat-improvements
git push origin master
```

### 6. Cleanup:
```bash
git branch -d feature/chat-improvements
git push origin --delete feature/chat-improvements
```

---

## Troubleshooting

### Error: "fatal: remote origin already exists"

```bash
# Update existing remote
git remote set-url origin https://github.com/YOUR_USERNAME/ops-platform.git
```

### Error: "fatal: destination path already exists"

```bash
# When cloning for testing
# Make sure you're not cloning into an existing directory
rm -rf ops-platform  # if it exists
git clone https://github.com/YOUR_USERNAME/ops-platform.git
```

### Error: "Authentication failed"

```bash
# For HTTPS: Use GitHub personal access token instead of password
# For SSH: Ensure SSH key is added to GitHub

# To switch from HTTPS to SSH:
git remote set-url origin git@github.com:YOUR_USERNAME/ops-platform.git
```

### Error: ".env.local accidentally committed"

```bash
# If you accidentally committed .env.local:
git rm --cached .env.local
git commit -m "Remove .env.local from git history"
git push origin master

# Then rotate all secrets in .env.local
# And regenerate any API keys that were exposed
```

### Large files or slow push

```bash
# If build artifacts are huge:
# Verify .gitignore includes .next, node_modules, dist

# Force ignore cached files:
git rm --cached -r .next
git rm --cached -r node_modules
git commit -m "Remove build artifacts from git"
git push origin master
```

---

## Security Reminders

1. ✅ **Never commit `.env.local`** - It's in `.gitignore`
2. ✅ **Use `.env.example`** as template only
3. ✅ **Store secrets** in Railway/Vercel dashboards, NOT in code
4. ✅ **Rotate credentials** if exposed
5. ✅ **Use HTTPS or SSH** for git operations
6. ✅ **Keep SSH keys private** - Never share them
7. ✅ **Use strong PAT token** - Set expiration and limited scopes

---

## Next Steps

After GitHub is set up:

1. ✅ Push to GitHub (you are here)
2. ⏭️ [Set up Vercel deployment](./DEPLOYMENT.md#step-1-vercel-frontend-deployment)
3. ⏭️ [Set up Railway deployment](./DEPLOYMENT.md#step-2-railway-real-time-server-deployment)
4. ⏭️ Configure environment variables on each platform
5. ⏭️ Test both deployments

---

## Quick Command Reference

```bash
# Show git status
git status

# Show commit history
git log --oneline

# Show configured remotes
git remote -v

# Create and switch to new branch
git checkout -b branch-name

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard all changes since last commit
git reset --hard HEAD

# Stash changes temporarily
git stash

# View changes
git diff

# Sync with remote
git pull origin master
git push origin master
```

---

**GitHub Setup Complete! 🎉**

Your code is now safely stored on GitHub. Next: [Configure Vercel & Railway deployment](./DEPLOYMENT.md)
