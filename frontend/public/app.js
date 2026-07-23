const API_BASE = window.PRICEGUARD_API_URL || "/api/products";

const form = document.getElementById("addProductForm");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");
const productGrid = document.getElementById("productGrid");
const modal = document.getElementById("chartModal");
const closeModal = document.getElementById("closeModal");
const chartTitle = document.getElementById("chartTitle");
let chartInstance = null;

const CURRENCY_SYMBOLS = {
  PKR: "Rs. ",
  USD: "$",
  GBP: "£",
  EUR: "€",
  INR: "₹",
  CAD: "CA$",
  AED: "AED ",
  SAR: "SAR ",
};

function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency || "PKR"} `;
  return `${symbol}${Number(amount).toLocaleString()}`;
}

// --- Fetch & render products ---
async function loadProducts() {
  try {
    const res = await fetch(API_BASE);
    const products = await res.json();
    renderProducts(products);
  } catch (err) {
    productGrid.innerHTML = `<p class="empty-state">Could not load products. Is the backend running?</p>`;
  }
}

function updateStats(products) {
  const statCount = document.getElementById("statCount");
  const statAlerts = document.getElementById("statAlerts");
  if (statCount) statCount.textContent = products.length;
  if (statAlerts) statAlerts.textContent = products.filter((p) => p.target_price).length;
}

function renderProducts(products) {
  updateStats(products);
  if (!products.length) {
    productGrid.innerHTML = `<p class="empty-state">No products tracked yet. Add one above to get started.</p>`;
    return;
  }

  productGrid.innerHTML = products
    .map((p) => {
      const price = p.latest_price ? formatMoney(p.latest_price, p.currency) : "N/A";
      const inStock = p.in_stock === true || p.in_stock === "true";

      const latest = p.latest_price ? Number(p.latest_price) : null;
      const highest = p.highest_price ? Number(p.highest_price) : null;
      const lowest = p.lowest_price ? Number(p.lowest_price) : null;

      let discountBadge = "";
      if (latest && highest && highest > latest) {
        const pctOff = Math.round((1 - latest / highest) * 100);
        if (pctOff > 0) discountBadge = `<span class="discount-badge">-${pctOff}%</span>`;
      }

      let rangeHtml = "";
      if (highest && lowest && highest !== lowest) {
        rangeHtml = `
          <div class="price-range">
            <span class="low">Lowest <b>${formatMoney(lowest, p.currency)}</b></span>
            <span class="high">Highest <b>${formatMoney(highest, p.currency)}</b></span>
          </div>`;
      }

      const thumbInner = p.image_url
        ? `<img src="${escapeHtml(p.image_url)}" alt="" loading="lazy" />`
        : `<span class="thumb-fallback">${escapeHtml((p.site || "?").charAt(0).toUpperCase())}</span>`;

      let targetHtml = "";
      if (p.target_price && p.latest_price) {
        const target = Number(p.target_price);
        const latest = Number(p.latest_price);
        const hit = latest <= target;
        const pct = hit ? 100 : Math.max(4, Math.min(96, (target / latest) * 100));
        targetHtml = `
          <div class="target-row">
            <span class="target-label ${hit ? "hit" : ""}">${hit ? "✓ Target reached" : `Target ${formatMoney(target, p.currency)}`}</span>
            <div class="target-track"><div class="target-fill" style="width:${pct}%"></div></div>
          </div>`;
      }

      return `
        <div class="product-card" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-currency="${p.currency || "PKR"}">
          <div class="thumb">
            ${thumbInner}
            <span class="site-badge">${escapeHtml(p.site)}</span>
            <span class="stock-badge ${inStock ? "in" : "out"}">${inStock ? "In Stock" : "Out of Stock"}</span>
            ${discountBadge}
          </div>
          <div class="card-body">
            <p class="name">${escapeHtml(p.name)}</p>
            <span class="price-tag">${price}</span>
            ${rangeHtml}
            ${targetHtml}
            <div class="card-footer">
              <button class="icon-btn recheck-btn" data-id="${p.id}">↻ Re-check</button>
              <button class="icon-btn delete-btn" data-id="${p.id}">✕ Remove</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  // Card click -> open chart
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".icon-btn")) return; // ignore button clicks
      openChart(card.dataset.id, card.dataset.name, card.dataset.currency);
    });
  });

  // Delete
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`${API_BASE}/${btn.dataset.id}`, { method: "DELETE" });
      loadProducts();
    });
  });

  // Re-check
  document.querySelectorAll(".recheck-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      btn.textContent = "…";
      await fetch(`${API_BASE}/${btn.dataset.id}/check`, { method: "POST" });
      loadProducts();
    });
  });
}

// --- Add product form ---
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("url").value;
  const target_price = document.getElementById("targetPrice").value || null;
  const telegram_chat_id = document.getElementById("chatId").value || null;

  submitBtn.disabled = true;
  submitBtn.textContent = "Scraping...";
  formStatus.textContent = "";
  formStatus.className = "status-msg";

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, target_price, telegram_chat_id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add product");

    formStatus.textContent = `✓ Added: ${data.name}`;
    formStatus.className = "status-msg success";
    form.reset();
    loadProducts();
  } catch (err) {
    formStatus.textContent = `✕ ${err.message}`;
    formStatus.className = "status-msg error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "+ Add Product";
  }
});

// --- Chart modal ---
async function openChart(id, name, currency) {
  const res = await fetch(`${API_BASE}/${id}/history`);
  const history = await res.json();

  chartTitle.textContent = name;
  modal.classList.remove("hidden");

  const labels = history.map((h) => new Date(h.checked_at).toLocaleDateString());
  const prices = history.map((h) => h.price);

  const ctx = document.getElementById("priceChart").getContext("2d");
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `Price (${(currency || "PKR").trim()})`,
          data: prices,
          borderColor: "#FFB627",
          backgroundColor: "rgba(255, 182, 39, 0.10)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#7C8AAE" } } },
      scales: {
        x: { ticks: { color: "#7C8AAE" }, grid: { color: "#223056" } },
        y: { ticks: { color: "#7C8AAE" }, grid: { color: "#223056" } },
      },
    },
  });
}

closeModal.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

loadProducts();
