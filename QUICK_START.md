# ⚡ QUICK START - Copy & Paste Commands

Ready to deploy? Use these commands in order.

---

## Step 1️⃣ : Add GitHub Remote

```powershell
cd "c:\Users\vaish\Music\ops-socketio000000000000000000000000000000000000000\ops-socketio-updated\ops"
git remote add origin https://github.com/YOUR_USERNAME/ops-platform.git
git branch -M master
```

**Replace `YOUR_USERNAME` with your actual GitHub username**

---

## Step 2️⃣ : Push to GitHub

```powershell
git push -u origin master
```

When prompted for credentials:
- **Username**: Your GitHub username
- **Password**: Personal Access Token (get from GitHub → Settings → Developer settings → Personal access tokens → Generate new token)

---

## Step 3️⃣ : Verify Push

```powershell
git remote -v
```

Should show:
```
origin  https://github.com/YOUR_USERNAME/ops-platform.git (fetch)
origin  https://github.com/YOUR_USERNAME/ops-platform.git (push)
```

---

## Step 4️⃣ : Test Clean Install (Optional but Recommended)

```powershell
# Create temp directory
mkdir C:\temp-ops-test
cd C:\temp-ops-test

# Clone repository
git clone https://github.com/YOUR_USERNAME/ops-platform.git
cd ops-platform/ops

# Install and build
npm install
npm run build

# If successful, your setup is deployment-ready!
```

---

## 📱 Environment Variables (Copy to Deployment Platform)

Get these values and add to Vercel and Railway dashboards:

### From `.env.local` (your local file):
```bash
MONGODB_URI=...
ADMIN_EMAIL=admin@ops.com
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SENDER_EMAIL=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
ADMIN_WHATSAPP_NUMBER=...
JWT_SECRET=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=...
```

### For Vercel:
```bash
NEXT_PUBLIC_APP_URL=https://YOUR_VERCEL_DOMAIN.vercel.app
SOCKET_SERVER_URL=https://api.YOUR_DOMAIN.com
# ... other vars from .env.example
```

### For Railway:
```bash
NODE_ENV=production
PORT=3000
# ... all vars from .env.example
```

---

## 🔐 GitHub Personal Access Token (PAT)

If you don't have a GitHub PAT:

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Configuration:
   - **Token name**: "OPS Platform Deployment"
   - **Expiration**: 90 days
   - **Scopes**: Select `repo` (full control of private repositories)
4. Click "Generate token"
5. **Copy the token immediately** (you won't see it again!)
6. Use as password when git prompts

---

## 🚀 Deployment Platforms

### Vercel Setup
```
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "New Project"
4. Click "Import Git Repository"
5. Select your GitHub repository
6. Framework: Next.js
7. Root Directory: ops/
8. Build Command: npm run build
9. Add environment variables
10. Click "Deploy"
```

### Railway Setup
```
1. Go to https://railway.app
2. Sign in with GitHub
3. Click "New Project"
4. Click "Deploy from GitHub"
5. Select your GitHub repository
6. Root Directory: ops/
7. Add environment variables
8. Create custom domain: api.YOUR_DOMAIN.com
9. Click "Deploy"
```

---

## ✅ Verification Commands

### Check Git Configuration
```powershell
git config --local user.name
git config --local user.email
git remote -v
```

### Check Project Status
```powershell
cd "c:\Users\vaish\Music\ops-socketio000000000000000000000000000000000000000\ops-socketio-updated\ops"
git status
git log --oneline
```

### Verify Build Works
```powershell
npm install
npm run build
# Should complete without errors
```

### Check Environment Variables
```powershell
# View local env (only on your machine)
cat .env.local | Select-String -Pattern "^[A-Z_]+"

# Should NOT see in git
git ls-files | Select-String env.local
# Should return nothing (good!)
```

---

## 🔗 Important URLs

```
GitHub: https://github.com/NEW/ops-platform

Vercel Dashboard: https://vercel.com/dashboard

Railway Dashboard: https://railway.app/dashboard

MongoDB Atlas: https://cloud.mongodb.com

GitHub Personal Tokens: https://github.com/settings/tokens
```

---

## 📋 Checklist Before Pushing

- [ ] GitHub account created (https://github.com)
- [ ] Repository name decided: **ops-platform**
- [ ] `.env.local` file exists with actual secrets
- [ ] All external API keys obtained
- [ ] MongoDB URI is valid
- [ ] SMTP credentials tested
- [ ] JWT_SECRET is strong (min 32 chars, random)
- [ ] Vercel account created (https://vercel.com)
- [ ] Railway account created (https://railway.app)

---

## 🐛 If Something Goes Wrong

### "Remote already exists"
```powershell
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/ops-platform.git
```

### "Permission denied" during push
```powershell
# Use HTTPS with personal access token (not password)
# Or set up SSH:
# https://docs.github.com/en/authentication/connecting-to-github-with-ssh
```

### "Build fails locally"
```powershell
# Clear cache and reinstall
Remove-Item -Recurse -Force .next
Remove-Item -Recurse -Force node_modules
npm install
npm run build
```

### ".env.local accidentally committed"
```powershell
# Remove from git history
git rm --cached .env.local
git commit -m "Remove .env.local"
git push origin master

# Then rotate all secrets in .env.local
# And regenerate any exposed API keys
```

---

## 📞 Quick Reference

| Task | Command |
|------|---------|
| Check git status | `git status` |
| View commits | `git log --oneline` |
| Show remotes | `git remote -v` |
| Create branch | `git checkout -b feature-name` |
| Commit changes | `git add . && git commit -m "message"` |
| Push to GitHub | `git push origin master` |
| Install deps | `npm install` |
| Build project | `npm run build` |
| Start dev | `npm run dev` |
| Start production | `npm run start` |

---

## 🎯 Timeline

```
Step 1: Add remote + Push      →  5 min
Step 2: Verify on GitHub       →  1 min
Step 3: Create Vercel app      → 10 min
Step 4: Create Railway app     → 10 min
Step 5: Connect & test         →  5 min
────────────────────────────
Total                          → ~30 min
```

---

## ✨ You're Ready!

All setup is complete. Just follow the copy-paste commands above and you'll be live in 30 minutes.

**Start with Step 1️⃣ and work through Step 4️⃣**

Questions? See:
- [NEXT_STEPS.md](./NEXT_STEPS.md) - Detailed walkthrough
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Architecture deep dive
- [README.md](./README.md) - Project overview

---

**Good luck! 🚀**
