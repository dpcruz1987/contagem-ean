/* Contagem EAN/QTD - MVP PWA
   CSV: EAN;QTD; (com ; no final)
*/
const $ = (id) => document.getElementById(id);

const eanInput = $("ean");
const qtdInput = $("qtd");
const listEl = $("list");

const btnScan = $("btnScan");
const btnStop = $("btnStop");
const btnAdd = $("btnAdd");
const btnExport = $("btnExport");
const btnClear = $("btnClear");

const cameraWrap = $("cameraWrap");
const video = $("video");

let stream = null;
let scanning = false;

// --- Storage ---
const STORAGE_KEY = "contagem_ean_qtd_v1";
let items = loadItems();
render();

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// --- Helpers ---
function normalizeEAN(v) {
  return String(v || "").trim().replace(/\s+/g, "");
}
function parseQtd(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function upsertItem(ean, qtd) {
  const idx = items.findIndex((x) => x.ean === ean);
  if (idx >= 0) {
    items[idx].qtd = qtd; // aqui é "setar" quantidade
  } else {
    items.push({ ean, qtd });
  }
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

  // ordena por EAN pra ficar organizado
  const sorted = [...items].sort((a, b) => a.ean.localeCompare(b.ean));

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

  // bind actions
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

// --- Add item ---
btnAdd.addEventListener("click", () => {
  const ean = normalizeEAN(eanInput.value);
  const qtd = parseQtd(qtdInput.value);

  if (!ean) return alert("Informe o EAN (ou leia pela câmera).");
  if (qtd === null) return alert("Informe uma QTD válida (0 ou maior).");

  upsertItem(ean, qtd);

  // prepara pro próximo
  eanInput.value = "";
  qtdInput.value = "";
  eanInput.focus();
});

// --- Clear ---
btnClear.addEventListener("click", () => {
  if (!confirm("Limpar todos os itens?")) return;
  items = [];
  saveItems();
  render();
});

// --- Export CSV ---
btnExport.addEventListener("click", () => {
  const rows = [];
  rows.push("EAN;QTD;");

  // usar ordem atual (ordenada) só no export
  const sorted = [...items].sort((a, b) => a.ean.localeCompare(b.ean));
  for (const it of sorted) {
    rows.push(`${it.ean};${it.qtd};`);
  }

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

// --- Barcode scanning ---
// Usa BarcodeDetector se disponível; caso não, avisa (MVP). Se você quiser, eu te mando a versão com fallback ZXing.
btnScan.addEventListener("click", async () => {
  if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
    return alert("Seu navegador não suporta câmera.");
  }

  // BarcodeDetector (Chrome/Android costuma suportar bem)
  if (!("BarcodeDetector" in window)) {
    return alert("Leitura por câmera não suportada neste navegador. Me diga se o seu celular é iPhone ou Android que eu te mando a versão com fallback (ZXing).");
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    cameraWrap.style.display = "block";
    scanning = true;

    const detector = new BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"]
    });

    scanLoop(detector);
  } catch (err) {
    console.error(err);
    alert("Não foi possível acessar a câmera. Verifique permissões.");
  }
});

btnStop.addEventListener("click", stopCamera);

function stopCamera() {
  scanning = false;
  cameraWrap.style.display = "none";
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

async function scanLoop(detector) {
  while (scanning) {
    try {
      const barcodes = await detector.detect(video);
      if (barcodes && barcodes.length) {
        const raw = barcodes[0].rawValue || "";
        const ean = normalizeEAN(raw);
        if (ean) {
          eanInput.value = ean;
          qtdInput.focus();
          stopCamera();
          break;
        }
      }
    } catch (e) {
      // ignora e segue
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

// --- Register service worker ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
