# DEPLOY TO RENDER — Step by Step

## Prerequisites
- A GitHub account with this project pushed to a repository
- A Render account (free at https://render.com)

## Step 1: Push to GitHub

```bash
cd C:\Users\marcu\Desktop\Veiryon
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/veyrion-studio.git
git push -u origin main
```

## Step 2: Create Render Account
1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with your GitHub account
4. Authorize Render to access your repositories

## Step 3: Deploy with Blueprint (Recommended)
1. In Render dashboard, click "New +" → "Blueprint"
2. Connect your GitHub account if prompted
3. Select the `veyrion-studio` repository
4. Render will detect the `render.yaml` file and configure everything automatically
5. Click "Deploy"

This auto-creates:
- Web service on free tier
- 1GB persistent disk for the SQLite database
- All environment variables (secrets auto-generated)

## Step 3 (Alternative): Manual Setup
If blueprint doesn't work, create manually:

1. Click "New +" → "Web Service"
2. Connect your GitHub repo
3. Settings:
   - **Name:** veyrion-studio
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free

4. Add a Persistent Disk:
   - In the service settings, scroll to "Disks"
   - Click "Add Disk"
   - **Name:** data
   - **Mount Path:** /var/data
   - **Size:** 1 GB

5. Add Environment Variables (click "Environment" tab):
   ```
   NODE_ENV=production
   DATABASE_PATH=/var/data/database.sqlite
   JWT_SECRET=(click Generate)
   REFRESH_TOKEN_SECRET=(click Generate)
   SESSION_SECRET=(click Generate)
   ADMIN_EMAIL=admin@veyrion.dev
   ADMIN_PASSWORD=(choose a strong password)
   FRONTEND_URL=https://your-app-name.onrender.com
   CORS_ORIGIN=https://your-app-name.onrender.com
   ```

6. Click "Create Web Service"

## Step 4: First Deploy
- Render will build and start your app (takes 2-3 minutes on free tier)
- The server auto-creates the database and seeds admin user on first boot
- Your site will be live at `https://your-app-name.onrender.com`

## Step 5: Access Your Site
- **Frontend:** https://your-app-name.onrender.com
- **Admin Panel:** https://your-app-name.onrender.com/admin
- **API:** https://your-app-name.onrender.com/api/v1
- **Health Check:** https://your-app-name.onrender.com/health

## Admin Credentials
- **Email:** admin@veyrion.dev
- **Password:** (whatever you set in ADMIN_PASSWORD env var)

## Important Notes

### Free Tier Limitations
- Service spins down after 15 minutes of inactivity
- First request after spin-down takes 30-60 seconds (cold start)
- 750 hours/month included (enough for one service)
- No custom domain on free tier (upgrade to Starter for that)

### Database
- SQLite database lives on the persistent disk at `/var/data/database.sqlite`
- Data persists across deploys and restarts
- Database auto-migrates and seeds on each startup (idempotent — no duplicates)

### Updating
- Push changes to GitHub → Render auto-deploys
- Or click "Manual Deploy" → "Deploy latest commit" in Render dashboard

### Custom Domain (Optional)
1. Upgrade to Starter plan ($7/month)
2. In service settings, go to "Settings" → "Custom Domains"
3. Add your domain (e.g., veyrion.dev)
4. Update DNS: add a CNAME record pointing to your-app-name.onrender.com
5. Update FRONTEND_URL and CORS_ORIGIN env vars

### Stripe (When Ready)
Set these env vars in Render:
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Email (When Ready)
Set these env vars in Render:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```
