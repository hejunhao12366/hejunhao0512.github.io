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
  balances: {
    alipay: 321.86,
    wechat: 263.64,
    bank: 0,
    other: 0,
  },
  daysUntilLivingFee: 12,
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
    balances: {
      alipay: Number(nextState.balances?.alipay || 0),
      wechat: Number(nextState.balances?.wechat || 0),
      bank: Number(nextState.balances?.bank || 0),
      other: Number(nextState.balances?.other || 0),
    },
    daysUntilLivingFee: Math.max(1, Number(nextState.daysUntilLivingFee || 1)),
    notes: Array.isArray(nextState.notes) ? nextState.notes : [],
    dailyRecords: Array.isArray(nextState.dailyRecords) ? nextState.dailyRecords : [],
  };
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
  showSaved();
  updateHistoryButtons();
}

function showSaved() {
  const status = $("#saveStatus");
  if (!status) return;
  status.textContent = "已保存";
  status.classList.add("saved");
  window.clearTimeout(showSaved.timer);
  showSaved.timer = window.setTimeout(() => status.classList.remove("saved"), 900);
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
  $("#installmentNote").textContent = `分期：${money(state.installmentAmount)} / ${state.installmentMonths} = ${money(installmentPerMonth)}，突发情况时用`;
}

function renderDaily() {
  const balanceItems = getBalanceItems();
  const totalBalance = getTotalBalance();

  renderBalanceCards(balanceItems);
  $("#totalBalanceText").textContent = money(totalBalance);
  renderEditableText("#daysText", state.daysUntilLivingFee, "daysUntilLivingFee", true);
  $("#dailyCanUseText").textContent = `${money(totalBalance)} / ${state.daysUntilLivingFee} = ${money(totalBalance / state.daysUntilLivingFee)}`;
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

  $("#alipayInput").value = state.balances.alipay;
  $("#wechatInput").value = state.balances.wechat;
  $("#bankInput").value = state.balances.bank;
  $("#otherBalanceInput").value = state.balances.other;
  $("#daysInput").value = state.daysUntilLivingFee;
  $("#noteDateInput").value ||= new Date().toISOString().slice(0, 10);
}

function syncDebtForm() {
  rememberState();
  state.debts.baitiao = Number($("#baitiaoDebtInput").value || 0);
  state.debts.huabei = Number($("#huabeiDebtInput").value || 0);
  state.monthlyRepay.baitiao = Number($("#baitiaoRepayInput").value || 0);
  state.monthlyRepay.huabei = Number($("#huabeiRepayInput").value || 0);
  state.livingFee = Number($("#livingFeeInput").value || 0);
  state.installmentAmount = Number($("#installmentAmountInput").value || 0);
  state.installmentMonths = Math.max(1, Number($("#installmentMonthsInput").value || 1));
}

function syncDailyForm() {
  rememberState();
  state.balances.alipay = Number($("#alipayInput").value || 0);
  state.balances.wechat = Number($("#wechatInput").value || 0);
  state.balances.bank = Number($("#bankInput").value || 0);
  state.balances.other = Number($("#otherBalanceInput").value || 0);
  state.daysUntilLivingFee = Math.max(1, Number($("#daysInput").value || 1));
}

function autoSaveFromForm(formSelector, sync) {
  let timer;
  $(formSelector).addEventListener("input", (event) => {
    if (!event.target.matches("input, textarea")) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      sync();
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
  const record = {
    id: createId(),
    date: today,
    totalBalance,
    daysUntilLivingFee: state.daysUntilLivingFee,
    dailyCanUse: totalBalance / state.daysUntilLivingFee,
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
  rememberState();
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
