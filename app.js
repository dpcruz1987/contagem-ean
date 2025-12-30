const $ = (id) => document.getElementById(id);

const eanInput = $("ean");
const qtdInput = $("qtd");
const listEl = $("list");

const btnScan = $("btnScan");
const btnStop = $("btnStop");
const btnAdd = $("btnAdd");
const btnExport = $("btnExport");
const btnClear = $("btnClear");
const btnTorch = $("btnTorch");

const cameraWrap = $("cameraWrap");
const statusEl = $("status");
const lastScanEl = $("lastScan");

const STORAGE_KEY = "contagem_ean_qtd_v1";
let items = loadItems();

let html5QrCode = null;
let torchOn = false;

// ---------- Storage ----------
function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ---------- Helpers ----------
function normalizeEAN(v) {
  // mantém somente números (EAN costuma ser numérico)
  return String(v || "").trim().replace(/\D+/g, "");
}
function parseQtd(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

// ---------- CRUD ----------
function upsertItem(ean, qtd) {
  const idx = items.findIndex((x) => x.ean === ean);
  if (idx >= 0) items[idx].qtd = qtd;
  else items.push({ ean, qtd });
  saveItems();
  render();
}

function removeItem(ean) {
  items = items.filter((x) => x.ean !== ean);
  saveItems();
  render();
}

function render() {
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<div class="muted">Nenhum item adicionado ainda.</div>`;
    return;
  }

  const sorted = [...items].sort((a,b) => a.ean.localeCompare(b.ean));
  for (const it of sorted) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <strong>${it.ean}</strong><br/>
        <small>QTD: ${it.qtd}</small>
      </div>
      <div class="itemActions">
        <button class="mini ghost" data-edit="${it.ean}">✏️</button>
        <button class="mini danger" data-del="${it.ean}">🗑️</button>
      </div>
    `;
    listEl.appendChild(row);
  }

  listEl.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", () => removeItem(b.getAttribute("data-del")));
  });

  listEl.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const ean = b.getAttribute("data-edit");
      const it = items.find((x) => x.ean === ean);
      if (!it) return;
      eanInput.value = it.ean;
      qtdInput.value = it.qtd;
      qtdInput.focus();
    });
  });
}
render();

// ---------- Actions ----------
btnAdd.addEventListener("click", () => {
  const ean = normalizeEAN(eanInput.value);
  const qtd = parseQtd(qtdInput.value);

  if (!ean) return alert("Informe o EAN (ou leia pela câmera).");
  if (qtd === null) return alert("Informe uma QTD válida (0 ou maior).");

  upsertItem(ean, qtd);
  eanInput.value = "";
  qtdInput.value = "";
  eanInput.focus();
});

btnClear.addEventListener("click", () => {
  if (!confirm("Limpar todos os itens?")) return;
  items = [];
  saveItems();
  render();
});

btnExport.addEventListener("click", () => {
  const rows = ["EAN;QTD;"];
  const sorted = [...items].sort((a,b) => a.ean.localeCompare(b.ean));
  for (const it of sorted) rows.push(`${it.ean};${it.qtd};`);

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `contagem_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
});

// ---------- Scanner ----------
btnScan.addEventListener("click", async () => {
  if (!location.protocol.startsWith("https") && location.hostname !== "localhost") {
    return alert("Para usar câmera, abra via HTTPS (GitHub Pages
