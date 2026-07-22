# 🛡️ PriceGuard — Multi-Site Price Tracker & Alert System

PriceGuard automatically monitors product prices across e-commerce sites (Daraz.pk, Amazon, and more) and sends instant Telegram alerts when a price drops to your target. Built as a full-stack Node.js application with a live dashboard, historical price charts, and a scheduled scraping engine.

## ✨ Features

- **Track any product** by pasting its URL — the scraper auto-detects the site and pulls name, price, and image
- **Scheduled monitoring** — checks all tracked products automatically every 6 hours (configurable via cron)
- **Price history charts** — visualize how a product's price has changed over time
- **Telegram alerts** — get notified the moment a price drops to or below your target
- **Manual re-check** — force an instant price check for any product from the dashboard
- **Zero external dependencies for storage** — uses SQLite, no database server needed

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Scraping | Playwright |
| Database | PostgreSQL (hosted on [Neon](https://neon.tech)) |
| Scheduling | `node-cron` |
| Alerts | Telegram Bot API |
| Frontend | HTML5, CSS3, Vanilla JS, Chart.js |
| Hosting | Backend: [Railway](https://railway.app) (Docker) · Frontend: [Vercel](https://vercel.com) (static) |

## 📁 Project Structure

```
priceguard/
├── backend/
│   ├── src/
│   │   ├── server.js          # App entry point
│   │   ├── routes/products.js # REST API endpoints
│   │   ├── scraper/scraper.js # Playwright scraping engine
│   │   ├── db/database.js     # Postgres (Neon) schema & connection
│   │   ├── bot/telegramBot.js # Telegram alert integration
│   │   └── scheduler/scheduler.js # Cron job for auto price-checks
│   ├── Dockerfile             # Railway deployment (Playwright base image)
│   ├── package.json
│   └── .env.example
└── frontend/
    └── public/
        ├── index.html          # Dashboard UI
        ├── style.css
        ├── config.js           # Set your Railway backend URL here for Vercel
        └── app.js              # Dashboard logic (fetch, render, charts)
```

## 🚀 Getting Started (Local Development)

### 1. Install dependencies
```bash
cd backend
npm install
npx playwright install chromium
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env`:
- `DATABASE_URL` — a Postgres connection string. For local dev, either run Postgres locally or just use your Neon connection string (works fine for dev too).
- `TELEGRAM_BOT_TOKEN` — create a bot via [@BotFather](https://t.me/BotFather) on Telegram (optional — without it, alerts print to console instead)
- `CRON_SCHEDULE` — how often to auto-check prices (default: every 6 hours)

### 3. Run the server
```bash
npm start
```
Visit **http://localhost:5000** — the dashboard is served automatically for local dev.

---

## ☁️ Deploying to Production (Neon + Railway + Vercel)

This app deploys as three pieces: **database on Neon**, **backend on Railway**, **frontend on Vercel**.

### Step 1 — Database on Neon
1. Sign up at [neon.tech](https://neon.tech) and create a new project.
2. Open the project dashboard → **Connection Details** → copy the connection string (looks like `postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`).
3. Keep this handy — you'll paste it into Railway as `DATABASE_URL`. You don't need to run any SQL yourself; the app creates its tables automatically on first start.

### Step 2 — Backend on Railway
1. Push the `backend/` folder to a GitHub repo (or the whole `priceguard/` repo — Railway lets you set a root directory).
2. On [railway.app](https://railway.app), create a **New Project → Deploy from GitHub repo**.
3. In **Settings → Root Directory**, set it to `backend` (if you pushed the whole project).
4. Railway will detect the `Dockerfile` automatically and build from it — this image comes with Chromium and all Playwright system dependencies pre-installed, so scraping works out of the box.
5. In **Variables**, add:
   - `DATABASE_URL` → your Neon connection string
   - `FRONTEND_URL` → your Vercel URL (add this after Step 3, then redeploy)
   - `TELEGRAM_BOT_TOKEN` → optional
   - `CRON_SCHEDULE` → optional, defaults to every 6 hours
6. Railway auto-assigns a public URL like `https://priceguard-backend-production.up.railway.app` — copy it, you'll need it for the frontend.
7. Once deployed, test it: visit `https://your-railway-url/health` — should return `{"status":"ok"}`.

### Step 3 — Frontend on Vercel
1. Before deploying, edit `frontend/public/config.js` and set:
   ```js
   window.PRICEGUARD_API_URL = "https://your-railway-url/api/products";
   ```
   (use the Railway URL from Step 2, keep the `/api/products` path)
2. Push this change to GitHub.
3. On [vercel.com](https://vercel.com), create a **New Project** from your repo.
4. In project settings, set **Root Directory** to `frontend/public`. No build command needed — it's static HTML/CSS/JS.
5. Deploy. Vercel gives you a URL like `https://priceguard.vercel.app`.
6. Go back to Railway → Variables → set `FRONTEND_URL` to this Vercel URL → redeploy the backend so CORS allows requests from it.

### Step 4 — Verify end to end
Open your Vercel URL, add a product, and confirm it appears — this confirms Vercel (frontend) → Railway (backend + scraper) → Neon (database) are all talking to each other correctly.

> **Note:** Railway's free tier may spin down after inactivity, causing the first request after idle time to be slow (~10-20s) while the container wakes up and Postgres reconnects. This is normal — mention it if you demo this to a client.


## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/products` | List all tracked products with latest price |
| POST | `/api/products` | Add a new product (`{ url, target_price, telegram_chat_id }`) |
| GET | `/api/products/:id/history` | Get full price history for charting |
| POST | `/api/products/:id/check` | Manually trigger a price re-check |
| DELETE | `/api/products/:id` | Stop tracking a product |

## 🗺️ Roadmap / Possible Extensions

- Add more site scrapers (Alibaba, eBay)
- Email alerts as an alternative to Telegram
- Multi-user accounts with authentication
- Deploy scraper as a serverless function to avoid keeping a server always-on

---

Built by Muhammad Aqib Rauf
