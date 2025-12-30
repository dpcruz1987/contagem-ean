const $ = (id) => document.getElementById(id);

const eanInput = $("ean");
const qtdInput = $("qtd");
const listEl = $("list");

const btnScan = $("btnScan");
const btnStop = $("btnStop");
const btnRetry = $("btnRetry");
const btnAdd = $("btnAdd");
const btnExport = $("btnExport");
const btnClear = $("btnClear");

const cameraWrap = $("cameraWrap");
const statusEl = $("status");

const STORAGE_KEY = "contagem_ean_qtd_v1";
let items = loadItems();

let scanning = false;
let lastDetected = null;
let lastDetectedAt = 0;

function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function normalizeEAN(v) {
  return String(v || "").trim().replace(/\D+/g, "");
}
function parseQtd(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

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

// ----- Botões principais -----
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

// ----- Scanner (Quagga2) -----
btnScan.addEventListener("click", async () => {
  if (!location.protocol.startsWith("https") && location.hostname !== "localhost") {
    return alert("Para usar câmera, abra via HTTPS (GitHub Pages resolve isso).");
  }
  openScanner();
});

btnStop.addEventListener("click", closeScanner);
btnRetry.addEventListener("click", async () => {
  // reinicia a câmera caso trave
  await restartScanner();
});

function openScanner() {
  cameraWrap.style.display = "block";
  statusEl.textContent = "Abrindo…";
  statusEl.className = "pill ok";
  startQuagga();
}

async function restartScanner() {
  try { await stopQuagga(); } catch {}
  startQuagga();
}

function startQuagga() {
  if (scanning) return;

  scanning = true;
  lastDetected = null;
  lastDetectedAt = 0;

  // Importante: alvo onde o Quagga injeta o video/canvas
  const target = document.querySelector("#scanner");

  // Config otimizada pra EAN no iPhone
  Quagga.init({
    inputStream: {
      type: "LiveStream",
      target,
      constraints: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      area: { // recorta centro (melhora performance e acerto)
        top: "20%",
        right: "10%",
        left: "10%",
        bottom: "20%"
      }
    },
    locator: {
      patchSize: "medium",
      halfSample: true
    },
    numOfWorkers: 0, // iOS Safari: melhor 0
    frequency: 10,
    decoder: {
      readers: [
        "ean_reader",
        "ean_8_reader",
        "upc_reader",
        "code_128_reader"
      ]
    },
    locate: true
  }, (err) => {
    if (err) {
      console.error(err);
      statusEl.textContent = "Erro na câmera";
      statusEl.className = "pill bad";
      scanning = false;
      alert("Não consegui iniciar o scanner. Confirme permissões de câmera no Safari.");
      return;
    }

    Quagga.start();
    statusEl.textContent = "Lendo… aponte para o EAN";
  });

  Quagga.offDetected(onDetectedSafe);
  Quagga.onDetected(onDetectedSafe);
}

function onDetectedSafe(result) {
  const code = result?.codeResult?.code ? normalizeEAN(result.codeResult.code) : "";
  if (!code) return;

  // evita disparar várias vezes seguidas no mesmo EAN
  const now = Date.now();
  if (code === lastDetected && (now - lastDetectedAt) < 1200) return;

  lastDetected = code;
  lastDetectedAt = now;

  // feedback
  try { navigator.vibrate?.(50); } catch {}

  eanInput.value = code;
  statusEl.textContent = "Capturado ✓";

  // Para a câmera e joga foco na qtd
  closeScanner();
  setTimeout(() => qtdInput.focus(), 200);
}

function closeScanner() {
  cameraWrap.style.display = "none";
  stopQuagga().catch(() => {});
}

function stopQuagga() {
  return new Promise((resolve) => {
    if (!scanning) return resolve();
    try {
      Quagga.stop();
      Quagga.offDetected(onDetectedSafe);
    } catch {}
    scanning = false;

    // limpa o container do scanner (evita “vídeo congelado” ao reabrir)
    const target = document.querySelector("#scanner");
    if (target) {
      target.querySelectorAll("video, canvas").forEach(el => el.remove());
    }
    resolve();
  });
}
