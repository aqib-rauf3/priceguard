const express = require("express");
const router = express.Router();
const { pool } = require("../db/database");
const { scrapeProduct } = require("../scraper/scraper");
const { sendTelegramMessage } = require("../bot/telegramBot");

// GET all products with latest price
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
        (SELECT price FROM price_history WHERE product_id = p.id ORDER BY checked_at DESC LIMIT 1) as latest_price,
        (SELECT in_stock FROM price_history WHERE product_id = p.id ORDER BY checked_at DESC LIMIT 1) as in_stock
      FROM products p ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product's full price history (for chart)
router.get("/:id/history", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT price, in_stock, checked_at FROM price_history WHERE product_id = $1 ORDER BY checked_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add a new product to track (scrapes it immediately)
router.post("/", async (req, res) => {
  const { url, target_price, telegram_chat_id } = req.body;
  if (!url) return res.status(400).json({ error: "Product URL is required" });

  try {
    const scraped = await scrapeProduct(url);

    const insertProduct = await pool.query(
      `INSERT INTO products (name, url, site, image_url, target_price, telegram_chat_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        scraped.name,
        url,
        scraped.site,
        scraped.imageUrl,
        target_price || null,
        telegram_chat_id || null,
      ]
    );
    const productId = insertProduct.rows[0].id;

    await pool.query(
      `INSERT INTO price_history (product_id, price, in_stock) VALUES ($1, $2, $3)`,
      [productId, scraped.price, scraped.inStock]
    );

    res.status(201).json({ id: productId, ...scraped });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This product is already being tracked" });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE a product
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST manually trigger a re-check for one product
router.post("/:id/check", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [
      req.params.id,
    ]);
    const product = rows[0];
    if (!product) return res.status(404).json({ error: "Product not found" });

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

    res.json(scraped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
