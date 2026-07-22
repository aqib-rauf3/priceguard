const { chromium } = require("playwright");

/**
 * Detects which site a URL belongs to, so we can apply the right
 * scraping selectors. Easy to extend with more sites later.
 */
function detectSite(url) {
  if (url.includes("daraz.pk")) return "daraz";
  if (url.includes("amazon.")) return "amazon";
  return "generic";
}

/**
 * Site-specific selector configs.
 * Each site has different HTML structure, so selectors differ.
 */
const SITE_CONFIG = {
  daraz: {
    name: ".pdp-mod-product-badge-title, .pdp-product-title",
    price: ".pdp-price, .pdp-product-price .pdp-price_type_normal",
    image: ".gallery-preview-panel__image, .pdp-mod-common-image",
  },
  amazon: {
    name: "#productTitle",
    price: ".a-price .a-offscreen",
    image: "#landingImage",
  },
};

/**
 * Pulls the largest plausible price out of a raw text string.
 * Handles formats like "Rs. 12,499", "PKR 12,499.00", "$45.99", "4.5 (352)".
 * Rejects tiny numbers (ratings, percentages) by requiring at least 3 digits
 * before the decimal point, unless it's the ONLY number found.
 */
function extractPrice(text) {
  if (!text) return null;
  const matches = text.match(/[\d,]+(?:\.\d+)?/g);
  if (!matches) return null;

  const candidates = matches
    .map((m) => parseFloat(m.replace(/,/g, "")))
    .filter((n) => !isNaN(n) && n > 0);

  if (!candidates.length) return null;

  // Prefer numbers that look like real prices (>= 10), fall back to the
  // largest candidate if nothing qualifies (avoids picking up "4.5" ratings).
  const plausible = candidates.filter((n) => n >= 10);
  return plausible.length ? Math.max(...plausible) : Math.max(...candidates);
}

/**
 * Tries to read price/name/image from a page's JSON-LD structured data
 * (schema.org Product). Most e-commerce sites embed this for SEO, and it's
 * far more reliable than CSS selectors, which change often.
 */
async function extractFromJsonLd(page) {
  try {
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();

    for (const raw of scripts) {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = item["@type"];
        if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          const price = offer?.price ? parseFloat(offer.price) : null;
          return {
            name: item.name || null,
            price: price && price > 0 ? price : null,
            imageUrl: Array.isArray(item.image) ? item.image[0] : item.image || null,
            inStock: offer?.availability
              ? !/outofstock/i.test(offer.availability)
              : null,
          };
        }
      }
    }
  } catch {
    // structured data not available/parsable — caller falls back to selectors
  }
  return null;
}

/**
 * Scrapes a single product page and returns { name, price, imageUrl, inStock }
 */
async function scrapeProduct(url) {
  const site = detectSite(url);
  const config = SITE_CONFIG[site] || SITE_CONFIG.daraz;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000); // let dynamic content settle

    // 1. Try structured data first — most reliable, survives site redesigns
    const structured = await extractFromJsonLd(page);

    // 2. Fall back to CSS selectors for whatever structured data missed
    const name =
      structured?.name ||
      (await page.locator(config.name).first().textContent().catch(() => null));

    let price = structured?.price ?? null;
    if (price === null) {
      const priceRaw = await page
        .locator(config.price)
        .first()
        .textContent()
        .catch(() => null);
      price = extractPrice(priceRaw);
    }

    const imageUrl =
      structured?.imageUrl ||
      (await page.locator(config.image).first().getAttribute("src").catch(() => null));

    await browser.close();

    return {
      site,
      name: name ? name.trim() : "Unknown Product",
      price: price,
      imageUrl: imageUrl || null,
      inStock: structured?.inStock ?? price !== null,
    };
  } catch (err) {
    await browser.close();
    throw new Error(`Scrape failed for ${url}: ${err.message}`);
  }
}

module.exports = { scrapeProduct, detectSite };
