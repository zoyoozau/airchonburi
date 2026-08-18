const API_BASE = window.APP_CONFIG?.apiBase || "/api";
const DEMO = new URLSearchParams(location.search).get("demo") === "1";
const state = { user: null, customers: [], query: "" };

const $ = (selector) => document.querySelector(selector);
const loginView = $("#loginView");
const appView = $("#appView");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(value) { if (!value) return "-"; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function daysUntil(value) { const end = new Date(`${value}T23:59:59`); return Math.ceil((end - new Date()) / 86400000); }
function setStatus(message, error = false) { const node = $("#syncStatus"); node.textContent = message; node.style.color = error ? "#bd2531" : ""; }

function demoCustomers() {
  const saved = localStorage.getItem("aircare-demo-customers");
  if (saved) return JSON.parse(saved);
  return [{ id: "demo-1", name: "สมชาย ใจดี", phone: "099-149-6852", joinedAt: "2026-08-01", expiresAt: "2027-08-01", address: "99/9", points: 3, tier: "VIP" }, { id: "demo-2", name: "ร้านแอร์ตัวอย่าง", phone: "081-234-5678", joinedAt: "2026-07-12", expiresAt: "2027-01-12", address: "12/34", points: 1, tier: "ธรรมดา" }];
}

async function api(action, data = {}) {
  if (DEMO) {
    if (action === "login") return { ok: true, token: "demo-token", user: { username: data.username || "demo", name: "โหมดตัวอย่าง", role: "admin" } };
    if (action === "listCustomers") return { ok: true, customers: demoCustomers() };
    if (action === "saveCustomer") { const list = demoCustomers(); const index = list.findIndex(item => item.id === data.customer.id); if (index >= 0) list[index] = { ...list[index], ...data.customer }; else list.unshift({ ...data.customer, id: `demo-${Date.now()}` }); localStorage.setItem("aircare-demo-customers", JSON.stringify(list)); return { ok: true }; }
    if (action === "pointDelta") { const list = demoCustomers(); const item = list.find(row => row.id === data.id); if (!item) throw new Error("ไม่พบลูกค้า"); item.points = Math.max(0, Number(item.points || 0) + Number(data.delta)); localStorage.setItem("aircare-demo-customers", JSON.stringify(list)); return { ok: true, customer: item }; }
    return { ok: true };
  }
  const response = await fetch(API_BASE, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, token: sessionStorage.getItem("aircare-token"), ...data }) });
  const result = await response.json().catch(() => ({ ok: false, error: "เซิร์ฟเวอร์ส่งข้อมูลไม่ถูกต้อง" }));
  if (!response.ok || result.ok === false) throw new Error(result.error || "เกิดข้อผิดพลาด");
  return result;
}

function showApp(user) {
  state.user = user;
  loginView.classList.add("hidden"); appView.classList.remove("hidden");
  $("#userBadge").textContent = `${user.name || user.username} · ${user.role || "staff"}`;
  loadCustomers();
}

async function loadCustomers() {
  setStatus("กำลังโหลดข้อมูล…");
  try { const result = await api("listCustomers"); state.customers = result.customers || []; render(); setStatus(`ซิงก์ล่าสุด ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`); $("#lastUpdated").textContent = `อัปเดต ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`; } catch (error) { setStatus(error.message, true); }
}

function render() {
  const query = state.query.trim().toLowerCase();
  const rows = state.customers.filter(item => [item.name, item.phone, item.address].some(value => String(value || "").toLowerCase().includes(query)));
  $("#customerRows").innerHTML = rows.map(item => {
    const remaining = item.expiresAt ? daysUntil(item.expiresAt) : 9999;
    const expiryClass = remaining < 0 ? "expired" : remaining <= 30 ? "soon" : "";
    return `<tr data-id="${escapeHtml(item.id)}"><td><span class="customer-name">${escapeHtml(item.name)}</span><span class="customer-sub">รหัส ${escapeHtml(item.id)}</span></td><td>${escapeHtml(item.phone)}</td><td>${formatDate(item.joinedAt)}</td><td class="${expiryClass}">${formatDate(item.expiresAt)}${remaining <= 30 ? `<span class="customer-sub">${remaining < 0 ? "หมดอายุแล้ว" : `เหลือ ${remaining} วัน`}</span>` : ""}</td><td>${escapeHtml(item.address)}</td><td><div class="points-control"><button data-action="point" data-delta="-1" aria-label="ลดแต้ม">−</button><span class="points-value">${Number(item.points || 0)}</span><button data-action="point" data-delta="1" aria-label="เพิ่มแต้ม">+</button></div></td><td><select class="tier-select" data-action="tier"><option ${item.tier === "ธรรมดา" ? "selected" : ""}>ธรรมดา</option><option ${item.tier === "VIP" ? "selected" : ""}>VIP</option></select></td><td><button class="row-action" data-action="edit">แก้ไข</button></td></tr>`;
  }).join("");
  $("#emptyState").classList.toggle("hidden", rows.length > 0);
  $("#totalCustomers").textContent = state.customers.length;
  $("#vipCustomers").textContent = state.customers.filter(item => item.tier === "VIP").length;
  $("#expiringCustomers").textContent = state.customers.filter(item => item.expiresAt && daysUntil(item.expiresAt) <= 30).length;
  $("#totalPoints").textContent = state.customers.reduce((sum, item) => sum + Number(item.points || 0), 0);
}

function openCustomerForm(customer = null) {
  const form = $("#customerForm"); form.reset();
  $("#customerFormCard").classList.remove("hidden"); $("#formTitle").textContent = customer ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้าใหม่"; $("#customerFormError").textContent = "";
  form.elements.id.value = customer?.id || ""; form.elements.name.value = customer?.name || ""; form.elements.phone.value = customer?.phone || ""; form.elements.joinedAt.value = customer?.joinedAt || today(); form.elements.expiresAt.value = customer?.expiresAt || ""; form.elements.address.value = customer?.address || ""; form.elements.points.value = customer?.points || 0; form.elements.tier.value = customer?.tier || "ธรรมดา";
  form.elements.name.focus();
}
function closeCustomerForm() { $("#customerFormCard").classList.add("hidden"); }

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const error = $("#loginError"); error.textContent = "กำลังตรวจสอบ…";
  try { const result = await api("login", { username: form.get("username"), password: form.get("password") }); if (!DEMO) sessionStorage.setItem("aircare-token", result.token); error.textContent = ""; showApp(result.user); } catch (err) { error.textContent = err.message; }
});
$("#logoutButton").addEventListener("click", () => { sessionStorage.removeItem("aircare-token"); state.user = null; appView.classList.add("hidden"); loginView.classList.remove("hidden"); });
$("#refreshButton").addEventListener("click", loadCustomers);
$("#searchInput").addEventListener("input", event => { state.query = event.target.value; render(); });
$("#newCustomerButton").addEventListener("click", () => openCustomerForm());
$("#cancelFormButton").addEventListener("click", closeCustomerForm); $("#cancelFormButton2").addEventListener("click", closeCustomerForm);
$("#customerForm").addEventListener("submit", async event => { event.preventDefault(); const form = new FormData(event.currentTarget); const customer = Object.fromEntries(form.entries()); customer.points = Number(customer.points || 0); const error = $("#customerFormError"); try { await api("saveCustomer", { customer }); closeCustomerForm(); await loadCustomers(); } catch (err) { error.textContent = err.message; } });
$("#customerRows").addEventListener("click", async event => { const control = event.target.closest("[data-action]"); if (!control) return; const row = control.closest("tr"); const customer = state.customers.find(item => item.id === row.dataset.id); if (!customer) return;
  try { if (control.dataset.action === "edit") openCustomerForm(customer); if (control.dataset.action === "point") { await api("pointDelta", { id: customer.id, delta: Number(control.dataset.delta) }); await loadCustomers(); } } catch (err) { setStatus(err.message, true); }
});
$("#customerRows").addEventListener("change", async event => { if (event.target.dataset.action !== "tier") return; const row = event.target.closest("tr"); const customer = state.customers.find(item => item.id === row.dataset.id); try { await api("saveCustomer", { customer: { ...customer, tier: event.target.value } }); await loadCustomers(); } catch (err) { setStatus(err.message, true); } });

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
if (DEMO) showApp({ username: "demo", name: "โหมดตัวอย่าง", role: "admin" });
