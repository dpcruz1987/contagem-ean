const $ = (id) => document.getElementById(id);

const nameInput = $("name");
const emailInput = $("email");
const phoneInput = $("phone");
const listEl = $("list");

const btnAdd = $("btnAdd");
const btnCancel = $("btnCancel");
const btnExport = $("btnExport");
const btnClear = $("btnClear");

const STORAGE_KEY = "cadastro_clientes_v1";
let items = loadItems();
let editId = null;

// ---------- Storage ----------
function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ---------- Helpers ----------
function normalizeText(value) {
  return String(value || "").trim();
}
function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}
function normalizePhone(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}
function isValidEmail(value) {
  if (!value) return true;
  return /^\S+@\S+\.\S+$/.test(value);
}
function createId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `cli_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setEditingState(id = null) {
  editId = id;
  btnAdd.textContent = editId ? "💾 Salvar" : "➕ Adicionar";
  btnCancel.style.display = editId ? "block" : "none";
}

function resetForm() {
  nameInput.value = "";
  emailInput.value = "";
  phoneInput.value = "";
  setEditingState(null);
  nameInput.focus();
}

// ---------- CRUD ----------
function upsertItem(payload) {
  if (payload.id) {
    const idx = items.findIndex((x) => x.id === payload.id);
    if (idx >= 0) items[idx] = payload;
    else items.push(payload);
  } else {
    items.push({ ...payload, id: createId() });
  }
  saveItems();
  render();
}

function removeItem(id) {
  items = items.filter((x) => x.id !== id);
  saveItems();
  render();
}

function render() {
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<div class="muted">Nenhum cliente cadastrado ainda.</div>`;
    return;
  }

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  for (const it of sorted) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <strong>${it.name}</strong><br/>
        <small>${it.email || "Sem e-mail"} • ${it.phone || "Sem telefone"}</small>
      </div>
      <div class="itemActions">
        <button class="mini ghost" data-edit="${it.id}">✏️</button>
        <button class="mini danger" data-del="${it.id}">🗑️</button>
      </div>
    `;
    listEl.appendChild(row);
  }

  listEl.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", () => removeItem(b.getAttribute("data-del")));
  });

  listEl.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-edit");
      const it = items.find((x) => x.id === id);
      if (!it) return;
      nameInput.value = it.name;
      emailInput.value = it.email;
      phoneInput.value = it.phone;
      setEditingState(it.id);
      nameInput.focus();
    });
  });
}
render();

// ---------- Actions ----------
btnAdd.addEventListener("click", () => {
  const name = normalizeText(nameInput.value);
  const email = normalizeEmail(emailInput.value);
  const phone = normalizePhone(phoneInput.value);

  if (!name) return alert("Informe o nome do cliente.");
  if (!isValidEmail(email)) return alert("Informe um e-mail válido ou deixe em branco.");

  upsertItem({
    id: editId,
    name,
    email,
    phone
  });
  resetForm();
});

btnCancel.addEventListener("click", resetForm);

btnClear.addEventListener("click", () => {
  if (!confirm("Limpar todos os clientes?")) return;
  items = [];
  saveItems();
  render();
  resetForm();
});

btnExport.addEventListener("click", () => {
  const rows = ["Nome;Email;Telefone;"];
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  for (const it of sorted) {
    rows.push(`${it.name};${it.email || ""};${it.phone || ""};`);
  }

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
});
