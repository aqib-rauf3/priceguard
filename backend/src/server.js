require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const productsRouter = require("./routes/products");
const { initBot } = require("./bot/telegramBot");
const { startScheduler } = require("./scheduler/scheduler");
const { initDb } = require("./db/database");

const app = express();
const PORT = process.env.PORT || 5000;

// Allow the deployed Vercel frontend (and localhost for dev) to call this API.
// Set FRONTEND_URL in Railway's env vars to your Vercel domain, e.g.
// https://priceguard.vercel.app
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5000"].filter(
  Boolean
);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  })
);
app.use(express.json());

// API routes
app.use("/api/products", productsRouter);

// Serve the frontend too, useful for local dev — harmless in production
// since Vercel serves the real frontend separately.
app.use(express.static(path.join(__dirname, "..", "..", "frontend", "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "PriceGuard API" });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`🚀 PriceGuard server running at http://localhost:${PORT}`);
    initBot();
    startScheduler();
  });
}

start().catch((err) => {
  console.error("❌ Failed to start server:", err.message);
  process.exit(1);
});
