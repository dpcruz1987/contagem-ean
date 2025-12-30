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
const statusEl = $("status");

const STORAGE_KEY = "contagem_ean_qtd_v1";
let items = loadItems();

// Scanner (html5-qrcode)
let html5QrCode = null;

function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

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

// Adicionar
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

// Limpar lista
btnClear.addEventListener("click", () => {
  if (!confirm("Limpar todos os itens?")) return;
  items = [];
  saveItems();
  render();
});

// Exportar CSV (cabeçalho + ; no final das linhas)
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

// Abrir scanner (iPhone friendly)
btnScan.addEventListener("click", async () => {
  if (!location.protocol.startsWith("https") && location.hostname !== "localhost") {
    return alert("Para usar câmera, abra via HTTPS (GitHub Pages resolve isso).");
  }

  cameraWrap.style.display = "block";
  statusEl.textContent = "Lendo…";
  statusEl.className = "pill ok";

  try {
    // cria 1x
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      // formatos suportados (não travar se algum não existir em certos browsers)
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39
      ]
    };

    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        const ean = normalizeEAN(decodedText);
        if (ean) {
          eanInput.value = ean;
          qtdInput.focus();
          statusEl.textContent = "Capturado ✓";
          stopCamera();
        }
      },
      () => {} // ignora erros contínuos (normal durante scan)
    );

  } catch (e) {
    console.error(e);
    statusEl.textContent = "Erro na câmera";
    statusEl.className = "pill bad";
    alert(
      "Não foi possível abrir a câmera.\n\n" +
      "Confirme:\n" +
      "1) Você abriu no SAFARI (não no WhatsApp/Instagram)\n" +
      "2) Permitiu câmera quando o iPhone pediu\n" +
      "3) Ajustes > Safari > Câmera = Permitir"
    );
    cameraWrap.style.display = "none";
  }
});

// Fechar scanner
btnStop.addEventListener("click", stopCamera);

async function stopCamera() {
  cameraWrap.style.display = "none";
  try {
    if (html5QrCode && html5QrCode.isScanning) {
      await html5QrCode.stop();
      await html5QrCode.clear();
    }
  } catch {}
}
