const API_BASE = window.PRICEGUARD_API_URL || "/api/products";

const form = document.getElementById("addProductForm");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");
const productGrid = document.getElementById("productGrid");
const modal = document.getElementById("chartModal");
const closeModal = document.getElementById("closeModal");
const chartTitle = document.getElementById("chartTitle");
let chartInstance = null;

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
      const price = p.latest_price ? `Rs. ${Number(p.latest_price).toLocaleString()}` : "N/A";
      const inStock = p.in_stock === 1;
      return `
        <div class="product-card" data-id="${p.id}" data-name="${escapeHtml(p.name)}">
          <p class="site-tag">${p.site}</p>
          <p class="name">${escapeHtml(p.name)}</p>
          <div class="price-row">
            <span class="price-tag">${price}</span>
            <span class="stock-badge ${inStock ? "in" : "out"}">${inStock ? "In Stock" : "Out of Stock"}</span>
          </div>
          <div class="card-footer">
            <button class="icon-btn recheck-btn" data-id="${p.id}">↻ Re-check</button>
            <button class="icon-btn delete-btn" data-id="${p.id}">✕ Remove</button>
          </div>
        </div>
      `;
    })
    .join("");

  // Card click -> open chart
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".icon-btn")) return; // ignore button clicks
      openChart(card.dataset.id, card.dataset.name);
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
async function openChart(id, name) {
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
          label: "Price (Rs.)",
          data: prices,
          borderColor: "#2DD4BF",
          backgroundColor: "rgba(45, 212, 191, 0.1)",
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#8493AD" } } },
      scales: {
        x: { ticks: { color: "#8493AD" }, grid: { color: "#22314C" } },
        y: { ticks: { color: "#8493AD" }, grid: { color: "#22314C" } },
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
