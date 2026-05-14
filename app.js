const storeKey = "mobile-ledger-state-v3";
const oldStoreKeys = ["mobile-ledger-state-v1"];
const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const sampleState = {
  debts: {
    baitiao: 2382.52,
    huabei: 590.76,
  },
  monthlyRepay: {
    baitiao: 264.84,
    huabei: 590.76,
  },
  livingFee: 1500,
  installmentAmount: 590.76,
  installmentMonths: 3,
  installmentNote: "",
  balances: {
    alipay: 321.86,
    wechat: 263.64,
    bank: 0,
    other: 0,
  },
  paydayDay: 12,
  quickJump: {
    label: "支付宝",
    url: "alipays://",
  },
  sync: {
    token: "",
    gistId: "",
    updatedAt: 0,
  },
  notes: [
    { id: createId(), date: "2026-04-24", text: "321.86 + 263.64 = 585.5，585/12 = 48.75" },
    { id: createId(), date: "2026-04-24", text: "省 300 -> 285/12 = 23.75" },
    { id: createId(), date: "2026-04-24", text: "944/30 = 31.46667" },
  ],
  dailyRecords: [],
};

let state = loadState();
let undoStack = [];
let redoStack = [];
let syncTimer;
let applyingCloudState = false;

const $ = (selector) => document.querySelector(selector);
const money = (value) => Number(value || 0).toFixed(2).replace(/\.?0+$/, "");

function loadState() {
  const saved = localStorage.getItem(storeKey);
  if (saved) {
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      return clone(sampleState);
    }
  }

  for (const key of oldStoreKeys) {
    const oldSaved = localStorage.getItem(key);
    if (!oldSaved) continue;
    try {
      return migrateOldState(JSON.parse(oldSaved));
    } catch {
      return clone(sampleState);
    }
  }

  return clone(sampleState);
}

function migrateOldState(oldState) {
  const baitiao = oldState.accounts?.find((account) => account.id === "baitiao") || oldState.accounts?.[0];
  const huabei = oldState.accounts?.find((account) => account.id === "huabei") || oldState.accounts?.[1];
  return normalizeState({
    ...clone(sampleState),
    debts: {
      baitiao: Number(baitiao?.total || sampleState.debts.baitiao),
      huabei: Number(huabei?.total || sampleState.debts.huabei),
    },
    monthlyRepay: {
      baitiao: Number(baitiao?.monthlyDue || oldState.currentBaitiaoDue || sampleState.monthlyRepay.baitiao),
      huabei: Number(huabei?.monthlyDue || huabei?.total || sampleState.monthlyRepay.huabei),
    },
    livingFee: Number(oldState.budget || sampleState.livingFee),
    installmentAmount: Number(oldState.installmentTotal || sampleState.installmentAmount),
    installmentMonths: Number(oldState.periods || sampleState.installmentMonths),
  });
}

function normalizeState(nextState) {
  return {
    debts: {
      baitiao: Number(nextState.debts?.baitiao || 0),
      huabei: Number(nextState.debts?.huabei || 0),
    },
    monthlyRepay: {
      baitiao: Number(nextState.monthlyRepay?.baitiao || 0),
      huabei: Number(nextState.monthlyRepay?.huabei || 0),
    },
    livingFee: Number(nextState.livingFee || 0),
    installmentAmount: Number(nextState.installmentAmount || 0),
    installmentMonths: Math.max(1, Number(nextState.installmentMonths || 1)),
    installmentNote: String(nextState.installmentNote || ""),
    balances: {
      alipay: Number(nextState.balances?.alipay || 0),
      wechat: Number(nextState.balances?.wechat || 0),
      bank: Number(nextState.balances?.bank || 0),
      other: Number(nextState.balances?.other || 0),
    },
    paydayDay: clampPayday(nextState.paydayDay || nextState.daysUntilLivingFee || 1),
    quickJump: {
      label: String(nextState.quickJump?.label || "支付宝"),
      url: String(nextState.quickJump?.url || "alipays://"),
    },
    sync: {
      token: String(nextState.sync?.token || ""),
      gistId: String(nextState.sync?.gistId || ""),
      updatedAt: Number(nextState.sync?.updatedAt || 0),
    },
    notes: Array.isArray(nextState.notes) ? nextState.notes : [],
    dailyRecords: Array.isArray(nextState.dailyRecords) ? nextState.dailyRecords : [],
  };
}

function saveState({ upload = true, touch = true } = {}) {
  if (!applyingCloudState && touch) state.sync.updatedAt = Date.now();
  localStorage.setItem(storeKey, JSON.stringify(state));
  updateHistoryButtons();
  if (upload) queueCloudUpload();
}

function renderClock() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  $("#nowText").textContent = formatter.format(now);
}

function renderAll() {
  renderClock();
  renderQuickJump();
  renderSyncSettings();
  renderDashboard();
  renderForms();
  renderNotes();
  renderDailyRecords();
  updateHistoryButtons();
}

function renderDashboard() {
  renderDebt();
  renderMonth();
  renderDaily();
}

function renderDebt() {
  renderFormula("#debtFormula", "共", [
    { color: "red", value: state.debts.baitiao, path: "debts.baitiao" },
    { color: "blue", value: state.debts.huabei, path: "debts.huabei" },
  ]);
}

function renderMonth() {
  const normalRepay = state.monthlyRepay.baitiao + state.monthlyRepay.huabei;
  const installmentPerMonth = state.installmentAmount / state.installmentMonths;
  const splitRepay = Math.max(0, normalRepay - state.installmentAmount + installmentPerMonth);

  renderFormula("#repayFormula", "本月待还：", [
    { color: "red", value: state.monthlyRepay.baitiao, path: "monthlyRepay.baitiao" },
    { color: "blue", value: state.monthlyRepay.huabei, path: "monthlyRepay.huabei" },
  ]);

  renderEditableText("#livingFeeText", state.livingFee, "livingFee");
  renderEditableText("#livingFeeSplitText", state.livingFee, "livingFee");
  $("#normalRepayText").textContent = money(normalRepay);
  $("#normalLeftText").textContent = money(state.livingFee - normalRepay);
  $("#splitRepayText").textContent = money(splitRepay);
  $("#splitLeftText").textContent = money(state.livingFee - splitRepay);
  $("#installmentNote").textContent = state.installmentNote || `分期：${money(state.installmentAmount)} / ${state.installmentMonths} = ${money(installmentPerMonth)}，突发情况时用`;
}

function renderDaily() {
  const balanceItems = getBalanceItems();
  const totalBalance = getTotalBalance();
  const days = getDaysUntilLivingFee();
  const divisor = Math.max(1, days);

  renderBalanceCards(balanceItems);
  $("#totalBalanceText").textContent = money(totalBalance);
  $("#daysText").textContent = days;
  $("#dailyFormulaText").textContent = `${money(totalBalance)} / ${divisor}`;
  $("#dailyCanUseText").textContent = money(totalBalance / divisor);
}

function renderQuickJump() {
  const button = $("#quickJumpButton");
  if (!button) return;
  button.textContent = state.quickJump.label || "快捷";
}

function getDaysUntilLivingFee() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const payday = getPaydayDate(now.getFullYear(), now.getMonth(), state.paydayDay);
  const target = payday >= today ? payday : getPaydayDate(now.getFullYear(), now.getMonth() + 1, state.paydayDay);
  return Math.max(0, Math.round((target - today) / 86_400_000));
}

function getPaydayDate(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(clampPayday(day), lastDay));
}

function clampPayday(value) {
  return Math.min(31, Math.max(1, Math.round(Number(value || 1))));
}

function renderBalanceCards(items) {
  const container = $("#balanceCards");
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "balance-card";
    card.innerHTML = `
      <span class="balance-card-label">${item.label}</span>
      <span class="tag ${item.color} editable-value" data-path="${item.path}">${money(item.value)}</span>
    `;
    container.append(card);
  });
}

function getBalanceItems() {
  return [
    { label: "支付宝", color: "blue", value: state.balances.alipay, path: "balances.alipay" },
    { label: "微信", color: "mint", value: state.balances.wechat, path: "balances.wechat" },
    { label: "银行卡", color: "purple", value: state.balances.bank, path: "balances.bank" },
    { label: "其他", color: "red", value: state.balances.other, path: "balances.other" },
  ];
}

function getTotalBalance() {
  return Object.values(state.balances).reduce((sum, value) => sum + Number(value || 0), 0);
}

function renderFormula(selector, label, items) {
  const formula = $(selector);
  formula.innerHTML = "";

  const labelElement = document.createElement("span");
  labelElement.className = "formula-label";
  labelElement.textContent = label;
  formula.append(labelElement);

  const expression = document.createElement("div");
  expression.className = "formula-main";

  items.forEach((item, index) => {
    if (index > 0) expression.append(textSpan("+"));
    const value = document.createElement("span");
    value.className = `tag ${item.color}${item.path ? " editable-value" : ""}`;
    value.textContent = money(item.value);
    if (item.path) value.dataset.path = item.path;
    expression.append(value);
  });

  expression.append(textSpan("="));
  const total = document.createElement("span");
  total.className = "tag purple";
  total.textContent = money(items.reduce((sum, item) => sum + Number(item.value || 0), 0));
  expression.append(total);
  formula.append(expression);
}

function renderEditableText(selector, value, path, integer = false) {
  const element = $(selector);
  element.textContent = integer ? Math.round(Number(value || 0)) : money(value);
  element.classList.add("editable-value");
  element.dataset.path = path;
  element.dataset.integer = integer ? "true" : "false";
}

function textSpan(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span;
}

function renderForms() {
  $("#baitiaoDebtInput").value = state.debts.baitiao;
  $("#huabeiDebtInput").value = state.debts.huabei;
  $("#baitiaoRepayInput").value = state.monthlyRepay.baitiao;
  $("#huabeiRepayInput").value = state.monthlyRepay.huabei;
  $("#livingFeeInput").value = state.livingFee;
  $("#installmentAmountInput").value = state.installmentAmount;
  $("#installmentMonthsInput").value = state.installmentMonths;
  $("#installmentNoteInput").value = state.installmentNote;

  $("#alipayInput").value = state.balances.alipay;
  $("#wechatInput").value = state.balances.wechat;
  $("#bankInput").value = state.balances.bank;
  $("#otherBalanceInput").value = state.balances.other;
  $("#paydayDayInput").value = state.paydayDay;
  $("#quickJumpLabelInput").value = state.quickJump.label;
  $("#quickJumpUrlInput").value = state.quickJump.url;
  $("#syncTokenInput").value = state.sync.token;
  $("#syncGistInput").value = state.sync.gistId;
  $("#noteDateInput").value ||= new Date().toISOString().slice(0, 10);
}

function syncDebtForm({ remember = true } = {}) {
  if (remember) rememberState();
  state.debts.baitiao = Number($("#baitiaoDebtInput").value || 0);
  state.debts.huabei = Number($("#huabeiDebtInput").value || 0);
  state.monthlyRepay.baitiao = Number($("#baitiaoRepayInput").value || 0);
  state.monthlyRepay.huabei = Number($("#huabeiRepayInput").value || 0);
  state.livingFee = Number($("#livingFeeInput").value || 0);
  state.installmentAmount = Number($("#installmentAmountInput").value || 0);
  state.installmentMonths = Math.max(1, Number($("#installmentMonthsInput").value || 1));
  state.installmentNote = $("#installmentNoteInput").value.trim();
}

function syncDailyForm({ remember = true } = {}) {
  if (remember) rememberState();
  state.balances.alipay = Number($("#alipayInput").value || 0);
  state.balances.wechat = Number($("#wechatInput").value || 0);
  state.balances.bank = Number($("#bankInput").value || 0);
  state.balances.other = Number($("#otherBalanceInput").value || 0);
  state.paydayDay = clampPayday($("#paydayDayInput").value);
}

function syncQuickJumpForm({ remember = true } = {}) {
  if (remember) rememberState();
  state.quickJump.label = $("#quickJumpLabelInput").value.trim() || "快捷";
  state.quickJump.url = $("#quickJumpUrlInput").value.trim();
}

function syncCloudForm({ remember = true } = {}) {
  if (remember) rememberState();
  state.sync.token = $("#syncTokenInput").value.trim();
  state.sync.gistId = $("#syncGistInput").value.trim();
}

function autoSaveFromForm(formSelector, sync) {
  let timer;
  $(formSelector).addEventListener("input", (event) => {
    if (!event.target.matches("input, textarea")) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      sync({ remember: true });
      saveState();
      renderDashboard();
    }, 350);
  });
}

function renderNotes() {
  const notesList = $("#notesList");
  notesList.innerHTML = "";

  state.notes
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((note) => {
      const card = document.createElement("article");
      card.className = "day-card";
      const [, month, day] = note.date.split("-");
      card.innerHTML = `
        <div class="day-title">${Number(month)}.${Number(day)}</div>
        <div class="entry-line">
          <span class="entry-note">${escapeHtml(note.text)}</span>
          <button class="delete-entry" type="button" aria-label="删除备注" data-id="${note.id}">×</button>
        </div>
      `;
      notesList.append(card);
    });
}

function renderDailyRecords() {
  const recordsList = $("#dailyRecordsList");
  if (!recordsList) return;

  const records = state.dailyRecords.slice().sort((a, b) => b.date.localeCompare(a.date));
  $("#recordSummary").innerHTML = records.length
    ? `<span class="tag mint">${records.length}</span><span>条记录</span><span class="tag purple">最新 ${money(records[0].totalBalance)}</span>`
    : `<span>还没有保存记录</span>`;

  recordsList.innerHTML = "";
  if (!records.length) {
    recordsList.innerHTML = `<div class="empty-state">在计算界面点“保存今日记录”，这里会保留每天的总可用余额。</div>`;
    return;
  }

  records.forEach((record) => {
    const card = document.createElement("article");
    card.className = "record-card";
    card.innerHTML = `
      <div class="record-head">
        <div>
          <div class="record-date">${formatRecordDate(record.date)}</div>
          <div class="record-sub">${record.daysUntilLivingFee} 天，每天可用</div>
        </div>
        <button class="delete-record" type="button" aria-label="删除记录" data-id="${record.id}">×</button>
      </div>
      <div class="record-main">
        <span class="tag mint">${money(record.dailyCanUse)}</span>
        <span class="record-formula">${money(record.totalBalance)} / ${record.daysUntilLivingFee}</span>
      </div>
      <div class="record-grid">
        <span>支付宝 ${money(record.balances.alipay)}</span>
        <span>微信 ${money(record.balances.wechat)}</span>
        <span>银行卡 ${money(record.balances.bank)}</span>
        <span>其他 ${money(record.balances.other)}</span>
      </div>
    `;
    recordsList.append(card);
  });
}

function renderSyncSettings() {
  const status = $("#syncStatus");
  if (!status) return;
  status.textContent = state.sync.gistId ? `本机 ${formatSyncTime(state.sync.updatedAt)}` : "未开启";
  status.classList.toggle("connected", Boolean(state.sync.gistId));
}

function formatSyncTime(timestamp) {
  if (!timestamp) return "未保存";
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatRecordDate(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

$("#debtForm").addEventListener("submit", (event) => {
  event.preventDefault();
  syncDebtForm();
  saveState();
  renderAll();
});

$("#dailyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  syncDailyForm();
  saveState();
  renderAll();
});

$("#noteForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("#noteTextInput").value.trim();
  syncQuickJumpForm();
  syncCloudForm();
  if (!text) return;

  rememberState();
  state.notes.push({
    id: createId(),
    date: $("#noteDateInput").value,
    text,
  });
  $("#noteTextInput").value = "";
  saveState();
  renderAll();
});

$("#notesList").addEventListener("click", (event) => {
  const button = event.target.closest(".delete-entry");
  if (!button) return;

  rememberState();
  state.notes = state.notes.filter((note) => note.id !== button.dataset.id);
  saveState();
  renderAll();
});

$("#saveDailyRecordButton").addEventListener("click", () => {
  rememberState();
  const today = new Date().toISOString().slice(0, 10);
  const totalBalance = getTotalBalance();
  const days = getDaysUntilLivingFee();
  const divisor = Math.max(1, days);
  const record = {
    id: createId(),
    date: today,
    totalBalance,
    daysUntilLivingFee: days,
    dailyCanUse: totalBalance / divisor,
    balances: clone(state.balances),
  };

  const existingIndex = state.dailyRecords.findIndex((item) => item.date === today);
  if (existingIndex >= 0) {
    record.id = state.dailyRecords[existingIndex].id;
    state.dailyRecords[existingIndex] = record;
  } else {
    state.dailyRecords.push(record);
  }

  saveState();
  renderDailyRecords();
  switchView("recordsView");
});

$("#dailyRecordsList").addEventListener("click", (event) => {
  const button = event.target.closest(".delete-record");
  if (!button) return;

  rememberState();
  state.dailyRecords = state.dailyRecords.filter((record) => record.id !== button.dataset.id);
  saveState();
  renderDailyRecords();
});

$("#clearRecordsButton").addEventListener("click", () => {
  rememberState();
  state.dailyRecords = [];
  saveState();
  renderDailyRecords();
});

$("#resetButton").addEventListener("click", () => {
  if (!window.confirm("加载示例会替换当前数据。已支持撤销，但建议确认后再继续。")) return;
  rememberState();
  localStorage.setItem(`${storeKey}-before-sample`, JSON.stringify(state));
  state = clone(sampleState);
  saveState();
  renderAll();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".editor").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    $(`#${tab.dataset.tab}Form`).classList.add("active");
  });
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

function switchView(viewId) {
  document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  $(`#${viewId}`).classList.add("active");
  document.querySelector(`[data-view="${viewId}"]`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

autoSaveFromForm("#debtForm", syncDebtForm);
autoSaveFromForm("#dailyForm", syncDailyForm);

$("#noteForm").addEventListener("input", (event) => {
  if (!event.target.matches("#quickJumpLabelInput, #quickJumpUrlInput, #syncTokenInput, #syncGistInput")) return;
  const isSyncField = event.target.matches("#syncTokenInput, #syncGistInput");
  if (!isSyncField) syncQuickJumpForm({ remember: false });
  syncCloudForm({ remember: false });
  saveState({ upload: !isSyncField, touch: !isSyncField });
  renderQuickJump();
  renderSyncSettings();
  if (isSyncField && state.sync.gistId) setSyncStatus("选恢复或覆盖");
});

$("#installmentNote").addEventListener("click", () => {
  const nextNote = window.prompt("修改分期说明", state.installmentNote || $("#installmentNote").textContent);
  if (nextNote === null) return;
  rememberState();
  state.installmentNote = nextNote.trim();
  saveState();
  renderAll();
});

$("#quickJumpButton").addEventListener("click", () => {
  if (!state.quickJump.url) {
    switchView("calculatorView");
    document.querySelector('[data-tab="note"]').click();
    return;
  }
  window.location.href = state.quickJump.url;
});

$("#createCloudButton").addEventListener("click", async () => {
  syncCloudForm();
  await createCloudSave();
});

$("#pullCloudButton").addEventListener("click", async () => {
  syncCloudForm({ remember: false });
  saveState({ upload: false, touch: false });
  await pullCloudState({ force: true });
});

$("#pushCloudButton").addEventListener("click", async () => {
  syncCloudForm({ remember: false });
  saveState({ upload: false, touch: false });
  await pushCloudState({ immediate: true });
});

function canUseCloud() {
  return Boolean(state.sync.token && state.sync.gistId);
}

function setSyncStatus(message, connected = Boolean(state.sync.gistId)) {
  const status = $("#syncStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("connected", connected);
}

function exportCloudState() {
  const nextState = clone(state);
  nextState.sync.token = "";
  return nextState;
}

function applyCloudState(cloudState) {
  const localSync = clone(state.sync);
  const nextState = normalizeState(cloudState);
  nextState.sync.token = localSync.token;
  nextState.sync.gistId = localSync.gistId || nextState.sync.gistId;
  nextState.sync.updatedAt = Math.max(nextState.sync.updatedAt, Number(cloudState.sync?.updatedAt || 0));
  applyingCloudState = true;
  state = nextState;
  localStorage.setItem(storeKey, JSON.stringify(state));
  applyingCloudState = false;
  renderAll();
}

function queueCloudUpload() {
  if (applyingCloudState || !canUseCloud()) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => pushCloudState(), 300);
}

async function createCloudSave() {
  if (!state.sync.token) {
    setSyncStatus("先填 Token", false);
    return;
  }

  try {
    setSyncStatus("创建中...");
    const response = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: getGithubHeaders(),
      body: JSON.stringify({
        description: "理财 App 云同步数据",
        public: false,
        files: {
          "licai-data.json": {
            content: JSON.stringify(exportCloudState(), null, 2),
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`创建失败 ${response.status}`);
    const gist = await response.json();
    state.sync.gistId = gist.id;
    $("#syncGistInput").value = gist.id;
    saveState({ upload: false, touch: false });
    setSyncStatus("已创建，点覆盖");
  } catch (error) {
    setSyncStatus(error.message, false);
  }
}

async function pushCloudState() {
  if (!canUseCloud()) return;

  try {
    setSyncStatus("上传中...");
    const response = await fetch(`https://api.github.com/gists/${state.sync.gistId}`, {
      method: "PATCH",
      headers: getGithubHeaders(),
      body: JSON.stringify({
        files: {
          "licai-data.json": {
            content: JSON.stringify(exportCloudState(), null, 2),
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`上传失败 ${response.status}`);
    setSyncStatus(`已覆盖 ${formatSyncTime(state.sync.updatedAt)}`);
  } catch (error) {
    setSyncStatus(error.message, false);
  }
}

async function pullCloudState({ force = false } = {}) {
  if (!canUseCloud()) return;

  try {
    setSyncStatus("下载中...");
    const response = await fetch(`https://api.github.com/gists/${state.sync.gistId}`, {
      headers: getGithubHeaders(),
    });
    if (!response.ok) throw new Error(`下载失败 ${response.status}`);
    const gist = await response.json();
    const file = gist.files?.["licai-data.json"];
    if (!file?.content) throw new Error("云端无数据");
    const cloudState = normalizeState(JSON.parse(file.content));
    if (!force && cloudState.sync.updatedAt <= state.sync.updatedAt) {
      setSyncStatus(`无更新 ${formatSyncTime(state.sync.updatedAt)}`);
      return;
    }
    rememberState();
    applyCloudState(cloudState);
    setSyncStatus(`已恢复 ${formatSyncTime(state.sync.updatedAt)}`);
  } catch (error) {
    setSyncStatus(error.message, false);
  }
}

function getGithubHeaders() {
  return {
    Authorization: `Bearer ${state.sync.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pullCloudState();
});

window.addEventListener("focus", () => pullCloudState());
setInterval(() => pullCloudState(), 5_000);

document.addEventListener("click", (event) => {
  if (event.target.classList.contains("inline-number-input")) return;
  const target = event.target.closest(".editable-value");
  if (!target || target.querySelector("input")) return;
  startInlineEdit(target);
});

function startInlineEdit(target) {
  const path = target.dataset.path;
  const integer = target.dataset.integer === "true";
  const oldValue = getByPath(path);
  const input = document.createElement("input");
  input.className = "inline-number-input";
  input.type = "number";
  input.min = "0";
  input.step = integer ? "1" : "0.01";
  input.value = oldValue;

  target.textContent = "";
  target.append(input);
  input.focus();
  input.select();

  const commit = () => {
    const nextValue = integer ? Math.max(1, Math.round(Number(input.value || 1))) : Number(input.value || 0);
    if (Number(oldValue) === Number(nextValue)) {
      renderAll();
      return;
    }
    rememberState();
    setByPath(path, nextValue);
    saveState();
    renderAll();
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") renderAll();
  });
}

function getByPath(path) {
  return path.split(".").reduce((value, key) => value[key], state);
}

function setByPath(path, nextValue) {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((value, key) => value[key], state);
  target[last] = nextValue;
}

function rememberState() {
  undoStack.push(clone(state));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function restoreState(nextState) {
  state = normalizeState(nextState);
  saveState();
  renderAll();
}

function updateHistoryButtons() {
  const undoButton = $("#undoButton");
  const redoButton = $("#redoButton");
  if (!undoButton || !redoButton) return;
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

$("#undoButton").addEventListener("click", () => {
  if (!undoStack.length) return;
  redoStack.push(clone(state));
  restoreState(undoStack.pop());
});

$("#redoButton").addEventListener("click", () => {
  if (!redoStack.length) return;
  undoStack.push(clone(state));
  restoreState(redoStack.pop());
});

renderAll();
setInterval(renderClock, 30_000);
