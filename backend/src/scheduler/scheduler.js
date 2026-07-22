const cron = require("node-cron");
const { pool } = require("../db/database");
const { scrapeProduct } = require("../scraper/scraper");
const { sendTelegramMessage } = require("../bot/telegramBot");

/**
 * Checks every tracked product, logs its latest price, and sends a
 * Telegram alert if the price has dropped to/below the user's target.
 */
async function checkAllProducts() {
  const { rows: products } = await pool.query("SELECT * FROM products");
  console.log(`⏱️  Running scheduled check on ${products.length} product(s)...`);

  for (const product of products) {
    try {
      const scraped = await scrapeProduct(product.url);

      await pool.query(
        `INSERT INTO price_history (product_id, price, in_stock) VALUES ($1, $2, $3)`,
        [product.id, scraped.price, scraped.inStock]
      );

      if (
        product.target_price &&
        scraped.price &&
        scraped.price <= product.target_price &&
        product.telegram_chat_id
      ) {
        await sendTelegramMessage(
          product.telegram_chat_id,
          `🔔 Price Drop Alert!\n${product.name}\nNew price: Rs. ${scraped.price}\nTarget: Rs. ${product.target_price}\n${product.url}`
        );
      }
    } catch (err) {
      console.error(`Failed to check product ${product.id}:`, err.message);
    }
  }
}

/**
 * Starts the cron job. Default: every 6 hours.
 * Cron format: minute hour day month weekday
 */
function startScheduler() {
  const schedule = process.env.CRON_SCHEDULE || "0 */6 * * *";
  cron.schedule(schedule, checkAllProducts);
  console.log(`✅ Scheduler started (${schedule})`);
}

module.exports = { startScheduler, checkAllProducts };
