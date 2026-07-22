const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️  DATABASE_URL not set — set it to your Neon connection string in .env"
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Neon
});

// --- Schema setup ---
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      site TEXT NOT NULL,
      image_url TEXT,
      target_price REAL,
      telegram_chat_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      in_stock BOOLEAN DEFAULT TRUE,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ Database schema ready");
}

module.exports = { pool, initDb };

