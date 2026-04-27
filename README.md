# Later Letters — Backend

A small Node.js server that:
- Receives inbound emails from Mailgun and saves them as letters
- Serves letters and people data to the Later Letters frontend
- Authenticates users via Supabase

---

## Deploy to Railway (step by step)

### Step 1 — Create a GitHub account (if you don't have one)
Go to github.com and sign up free. You need this to deploy to Railway.

### Step 2 — Upload this code to GitHub
1. Go to github.com → click the + icon → New repository
2. Name it `later-letters-backend` → click Create repository
3. Click "uploading an existing file"
4. Drag ALL THREE files into the box:
   - server.js
   - package.json
   - .env.example
5. Click "Commit changes"

### Step 3 — Create a Railway account
1. Go to railway.app
2. Click "Start a New Project"
3. Sign up with your GitHub account (easiest)

### Step 4 — Deploy from GitHub
1. In Railway → click "New Project"
2. Click "Deploy from GitHub repo"
3. Select your `later-letters-backend` repository
4. Railway will automatically detect it's a Node.js app and deploy it

### Step 5 — Add your environment variables
1. In Railway → click on your project → click "Variables" tab
2. Add each of these (copy from your saved keys):

   SUPABASE_URL         → your Supabase project URL
   SUPABASE_SERVICE_KEY → your Supabase service role key
   MAILGUN_WEBHOOK_KEY  → your Mailgun API key

3. Click "Add" after each one

### Step 6 — Get your Railway URL
1. In Railway → click your project → "Settings" tab
2. Under "Domains" → click "Generate Domain"
3. You'll get a URL like: https://later-letters-backend-production.up.railway.app
4. SAVE THIS URL — you need it for two things:
   - Paste it into Mailgun's inbound route (Step 6 of Mailgun setup)
   - Paste it into your Later Letters HTML file as the API_URL

### Step 7 — Test it
Visit your Railway URL in a browser. You should see:
  { "status": "Later Letters backend is running 💙" }

If you see that — everything is working!

---

## How the email flow works

1. Someone emails emma@yourdomain.com
2. Mailgun catches it and POSTs to: https://your-railway-url/inbound
3. server.js reads the email, finds "emma" as the slug
4. Looks up which user owns that slug in Supabase
5. Saves the email as a letter in the letters table
6. Next time that user opens Later Letters, the letter appears

---

## API Endpoints

GET  /              → Health check
POST /inbound       → Mailgun webhook (receives emails)
GET  /letters       → Get all letters (requires auth token)
POST /letters       → Save a new letter (requires auth token)
DELETE /letters/:id → Delete a letter (requires auth token)
GET  /people        → Get all people (requires auth token)
POST /people        → Add a new person (requires auth token)
DELETE /people/:id  → Delete a person (requires auth token)
