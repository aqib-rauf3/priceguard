const { chromium } = require("playwright");

/**
 * Guesses the currency from the domain when structured data doesn't say.
 * Amazon's currency depends on which country storefront the URL is for,
 * NOT just "amazon." — .com is USD, .co.uk is GBP, etc.
 */
function detectCurrency(url) {
  if (url.includes("daraz.pk")) return "PKR";
  if (url.includes("amazon.co.uk")) return "GBP";
  if (url.includes("amazon.de") || url.includes("amazon.fr") || url.includes("amazon.it") || url.includes("amazon.es")) return "EUR";
  if (url.includes("amazon.ca")) return "CAD";
  if (url.includes("amazon.in")) return "INR";
  if (url.includes("amazon.ae")) return "AED";
  if (url.includes("amazon.sa")) return "SAR";
  if (url.includes("amazon.com")) return "USD";
  return "PKR"; // safest default for this app's primary audience
}

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
            currency: offer?.priceCurrency || null,
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
 * Tries each selector in a comma-separated list ONE AT A TIME, in the order
 * given, returning the first one that yields non-empty text/attribute.
 *
 * This matters because `page.locator("a, b").first()` picks whichever
 * matching element appears FIRST IN THE DOM — not whichever selector is
 * listed first. On pages where an "Out of Stock" badge happens to sit above
 * the product title in the markup, that combined-selector approach can grab
 * the badge text instead of the title. Trying selectors in explicit priority
 * order avoids that.
 */
async function firstMatchInOrder(page, selectorList, attr = null) {
  const selectors = selectorList.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      const value = attr ? await locator.getAttribute(attr) : await locator.textContent();
      if (value && value.trim()) return value.trim();
    } catch {
      // this selector didn't match on this page — try the next one
    }
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
    const name = structured?.name || (await firstMatchInOrder(page, config.name));

    let price = structured?.price ?? null;
    if (price === null) {
      const priceRaw = await firstMatchInOrder(page, config.price);
      price = extractPrice(priceRaw);
    }

    const imageUrl =
      structured?.imageUrl || (await firstMatchInOrder(page, config.image, "src"));

    await browser.close();

    return {
      site,
      name: name ? name.trim() : "Unknown Product",
      price: price,
      imageUrl: imageUrl || null,
      currency: structured?.currency || detectCurrency(url),
      inStock: structured?.inStock ?? price !== null,
    };
  } catch (err) {
    await browser.close();
    throw new Error(`Scrape failed for ${url}: ${err.message}`);
  }
}

module.exports = { scrapeProduct, detectSite, detectCurrency };
