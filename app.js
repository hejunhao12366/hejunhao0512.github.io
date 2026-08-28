const storeKey = "mobile-ledger-state-v3";
const oldStoreKeys = ["mobile-ledger-state-v1"];
const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const sampleState = {
  mode: "school",
  debts: {
    baitiao: 2382.52,
    huabei: 590.76,
  },
  monthlyRepay: {
    baitiao: 264.84,
    huabei: 590.76,
  },
  livingFee: 1500,
  repayPlan: { baitiao: [], huabei: [] },
  installmentAmount: 590.76,
  installmentMonths: 3,
  installmentNote: "",
  customSplits: [],
  balances: {
    alipay: 321.86,
    wechat: 263.64,
    bank: 0,
    other: 0,
  },
  paydayDay: 12,
  holidayDays: 30,
  holidayStartDate: "",
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
let syncFieldTimer;
let trendMonthOffset = 0; // 0 = current month, -1 = last month, etc.
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
    mode: nextState.mode === "holiday" ? "holiday" : "school",
    debts: {
      baitiao: Number(nextState.debts?.baitiao || 0),
      huabei: Number(nextState.debts?.huabei || 0),
    },
    monthlyRepay: {
      baitiao: Number(nextState.monthlyRepay?.baitiao || 0),
      huabei: Number(nextState.monthlyRepay?.huabei || 0),
    },
    livingFee: Number(nextState.livingFee || 0),
    repayPlan: {
      baitiao: Array.isArray(nextState.repayPlan?.baitiao) ? nextState.repayPlan.baitiao.map(m => ({ month: String(m.month || ""), amount: Number(m.amount || 0), paid: Boolean(m.paid) })) : [],
      huabei: Array.isArray(nextState.repayPlan?.huabei) ? nextState.repayPlan.huabei.map(m => ({ month: String(m.month || ""), amount: Number(m.amount || 0), paid: Boolean(m.paid) })) : [],
    },
    installmentAmount: Number(nextState.installmentAmount || 0),
    installmentMonths: Math.max(1, Number(nextState.installmentMonths || 1)),
    installmentNote: String(nextState.installmentNote || ""),
    customSplits: Array.isArray(nextState.customSplits) ? nextState.customSplits.map(s => ({
      id: String(s.id || createId()),
      label: String(s.label || ""),
      amount: Number(s.amount || 0),
      months: Math.max(1, Number(s.months || 1)),
    })) : [],
    balances: {
      alipay: Number(nextState.balances?.alipay || 0),
      wechat: Number(nextState.balances?.wechat || 0),
      bank: Number(nextState.balances?.bank || 0),
      other: Number(nextState.balances?.other || 0),
    },
    paydayDay: clampPayday(nextState.paydayDay || nextState.daysUntilLivingFee || 1),
    holidayDays: Math.max(1, Math.round(Number(nextState.holidayDays) || 30)),
    holidayStartDate: String(nextState.holidayStartDate || ""),
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
  renderSyncSettings();
  renderMode();
  renderDashboard();
  renderForms();
  renderNotes();
  renderDailyRecords();
  updateHistoryButtons();
}

function renderMode() {
  document.body.dataset.mode = state.mode;
  document.querySelectorAll(".mode-opt").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.mode === state.mode);
  });
}

function renderDashboard() {
  renderDebt();
  renderMonth();
  renderDaily();
}

function getRepayProgress(key) {
  // 已还进度 = 标记为 paid 的月份金额之和 ÷ 计划总额
  const plan = state.repayPlan?.[key] || [];
  if (plan.length === 0) return { percent: 0, paid: 0, total: 0 };
  const total = plan.reduce((s, m) => s + Number(m.amount || 0), 0);
  const paid = plan.filter(m => m.paid).reduce((s, m) => s + Number(m.amount || 0), 0);
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return { percent, paid, total };
}

function renderDebt() {
  renderFormula("#debtFormula", "共", [
    { color: "red", value: state.debts.baitiao, path: "debts.baitiao" },
    { color: "blue", value: state.debts.huabei, path: "debts.huabei" },
  ]);

  // 总进度 = 两路还款计划的加权平均
  const bt = getRepayProgress("baitiao");
  const hb = getRepayProgress("huabei");
  const totalPaid = bt.paid + hb.paid;
  const totalPlan = bt.total + hb.total;
  const percent = totalPlan > 0 ? Math.min(100, Math.round((totalPaid / totalPlan) * 100)) : 0;

  const fill = $("#repayProgressFill");
  const pct = $("#repayProgressPercent");
  if (fill) fill.style.width = percent + "%";
  if (pct) pct.textContent = percent + "%";
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

  renderCustomSplits();
}

function renderCustomSplits() {
  const container = $("#customSplitsContainer");
  if (!container) return;
  container.innerHTML = "";

  const splits = state.customSplits || [];
  splits.forEach((split) => {
    const perMonth = split.amount / split.months;
    const row = document.createElement("div");
    row.className = "balance-row custom-split-row";
    const labelText = split.label ? `- ${split.label}：` : "- 分期：";
    row.innerHTML = `
      <span class="split-label">${labelText}</span>
      <span>${money(state.livingFee)}</span>
      <span>-</span>
      <span class="tag purple">${money(perMonth)}</span>
      <span>=</span>
      <span class="tag mint">${money(state.livingFee - perMonth)}</span>
      <button class="split-delete" onclick="removeCustomSplit('${split.id}')" title="删除">✕</button>
    `;
    container.appendChild(row);
  });
}

function addCustomSplit() {
  const label = prompt("分期名称（可留空）：") || "";
  const amountStr = prompt("分期总金额：");
  if (!amountStr) return;
  const amount = Number(amountStr);
  if (isNaN(amount) || amount <= 0) { alert("金额无效"); return; }
  const monthsStr = prompt("分几期？", "1");
  const months = Math.max(1, Math.round(Number(monthsStr) || 1));

  state.customSplits = state.customSplits || [];
  state.customSplits.push({ id: createId(), label: label.trim(), amount, months });
  saveState();
  renderMonth();
}

function removeCustomSplit(id) {
  state.customSplits = (state.customSplits || []).filter(s => s.id !== id);
  saveState();
  renderMonth();
}

function addMonthToYM(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatYM(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

function ensurePlanMonth(key, month) {
  state.repayPlan[key] = state.repayPlan[key] || [];
  let entry = state.repayPlan[key].find(e => e.month === month);
  if (!entry) {
    entry = { month, amount: 0, paid: false };
    state.repayPlan[key].push(entry);
    state.repayPlan[key].sort((a, b) => a.month.localeCompare(b.month));
  }
  return entry;
}

function openRepayPlanModal() {
  const modal = $("#repayPlanModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  renderRepayPlanModal();
}

function closeRepayPlanModal() {
  const modal = $("#repayPlanModal");
  if (modal) modal.classList.add("hidden");
}

// 点击遮罩关闭弹窗
document.addEventListener("click", (e) => {
  const overlay = $("#repayPlanModal");
  if (overlay && !overlay.classList.contains("hidden") && e.target === overlay) {
    closeRepayPlanModal();
  }
});

function renderRepayPlanModal() {
  const currentYM = getCurrentYM();
  const keys = [
    { key: "baitiao", label: "白条", color: "red" },
    { key: "huabei", label: "花呗", color: "blue" },
  ];

  keys.forEach(({ key, label, color }) => {
    const container = $(`#planRows_${key}`);
    if (!container) return;
    container.innerHTML = "";

    const plan = state.repayPlan[key] || [];
    // 展示：从当月起 12 个月
    const months = [];
    for (let i = 0; i < 12; i++) months.push(addMonthToYM(currentYM, i));

    const prog = getRepayProgress(key);
    const header = $(`#planProgress_${key}`);
    if (header) header.textContent = `${prog.paid.toFixed(2)} / ${prog.total.toFixed(2)}（${prog.percent}%）`;

    months.forEach(ym => {
      const entry = plan.find(e => e.month === ym) || { month: ym, amount: 0, paid: false };
      const isCurrent = ym === currentYM;
      const isPaid = Boolean(entry.paid);
      const row = document.createElement("div");
      row.className = "plan-row" + (isCurrent ? " current" : "") + (isPaid ? " paid" : "");
      row.innerHTML = `
        <span class="plan-month ${color}">${formatYM(ym)}${isCurrent ? " ·本月" : ""}</span>
        <input type="number" step="0.01" min="0" value="${entry.amount}" data-key="${key}" data-month="${ym}" class="plan-amount-input" placeholder="0" />
        <button type="button" class="plan-paid-toggle ${isPaid ? "done" : ""}" data-key="${key}" data-month="${ym}">${isPaid ? "✓已还" : "未还"}</button>
      `;
      container.appendChild(row);
    });
  });

  // 绑定金额输入
  document.querySelectorAll(".plan-amount-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const k = e.target.dataset.key;
      const m = e.target.dataset.month;
      const val = Math.max(0, Number(e.target.value) || 0);
      const entry = ensurePlanMonth(k, m);
      entry.amount = val;
      saveState();
      renderDebt();
      // 更新进度显示但不全量重渲染（避免输入框失焦）
      const prog = getRepayProgress(k);
      const header = $(`#planProgress_${k}`);
      if (header) header.textContent = `${prog.paid.toFixed(2)} / ${prog.total.toFixed(2)}（${prog.percent}%）`;
    });
  });

  // 绑定"已还"切换
  document.querySelectorAll(".plan-paid-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const k = e.target.dataset.key;
      const m = e.target.dataset.month;
      const entry = ensurePlanMonth(k, m);
      entry.paid = !entry.paid;
      saveState();
      renderDebt();
      // 仅更新该行 + 进度，不全量重渲染
      e.target.textContent = entry.paid ? "✓已还" : "未还";
      e.target.classList.toggle("done", entry.paid);
      e.target.closest(".plan-row").classList.toggle("paid", entry.paid);
      const prog = getRepayProgress(k);
      const header = $(`#planProgress_${k}`);
      if (header) header.textContent = `${prog.paid.toFixed(2)} / ${prog.total.toFixed(2)}（${prog.percent}%）`;
    });
  });
}

function renderDaily() {
  const balanceItems = getBalanceItems();
  const totalBalance = getTotalBalance();
  const days = getDivisorDays();
  const divisor = Math.max(1, days);
  const dailyAmount = totalBalance / divisor;

  renderBalanceCards(balanceItems);
  $("#totalBalanceText").textContent = money(totalBalance);
  $("#daysText").textContent = days;
  $("#dailyFormulaText").textContent = `${money(totalBalance)} / ${divisor}`;
  $("#dailyCanUseText").textContent = money(dailyAmount);

  const highlight = document.querySelector(".daily-highlight");
  const isHoliday = state.mode === "holiday";
  // 假期模式：红色警示；在校模式：<30 时红色
  const shouldWarn = isHoliday || (dailyAmount > 0 && dailyAmount < 30);
  if (highlight) highlight.classList.toggle("warning", shouldWarn);

  if (isHoliday) {
    $("#dailyKicker").textContent = "假期";
    $("#dailyTitle").textContent = "每天可用";
    $("#daysLabel").textContent = "假期剩余";
  } else {
    $("#dailyKicker").textContent = "今天";
    $("#dailyTitle").textContent = "每天可用";
    $("#daysLabel").textContent = "距发生活费";
  }

  // 倒计时卡片：假期模式默认琥珀色（不依赖 urgent）
  const countdownCard = document.getElementById("countdownCard");
  if (countdownCard) {
    countdownCard.classList.toggle("holiday", isHoliday);
    countdownCard.classList.toggle("urgent", days <= 3);
  }
}

function getDivisorDays() {
  if (state.mode === "holiday") {
    if (!state.holidayStartDate) return state.holidayDays;
    const start = new Date(state.holidayStartDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsed = Math.floor((today - start) / 86400000);
    return Math.max(0, state.holidayDays - elapsed);
  }
  return getDaysUntilLivingFee();
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
  const set = (sel, val) => { const el = $(sel); if (el) el.value = val; };
  set("#installmentAmountInput", state.installmentAmount);
  set("#installmentMonthsInput", state.installmentMonths);
  set("#installmentNoteInput", state.installmentNote);
  set("#paydayDayInput", state.paydayDay);
  set("#holidayDaysInput", state.holidayDays);
  set("#syncTokenInput", state.sync.token);
  set("#syncGistInput", state.sync.gistId);
  set("#noteDateInput", $("#noteDateInput")?.value || new Date().toISOString().slice(0, 10));
}

function syncDebtForm({ remember = true } = {}) {
  if (remember) rememberState();
  const num = (sel) => Number($(sel)?.value || 0);
  state.installmentAmount = num("#installmentAmountInput");
  state.installmentMonths = Math.max(1, num("#installmentMonthsInput") || 1);
  state.installmentNote = $("#installmentNoteInput")?.value.trim() || "";
  state.paydayDay = clampPayday($("#paydayDayInput")?.value);
  const newHolidayDays = Math.max(1, Math.round(Number($("#holidayDaysInput")?.value || 30)));
  if (newHolidayDays !== state.holidayDays) {
    state.holidayStartDate = new Date().toISOString().slice(0, 10);
  }
  state.holidayDays = newHolidayDays;
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
    recordsList.innerHTML = `<div class="empty-state">在计算界面点"保存今日记录"，这里会保留每天的总可用余额。</div>`;
    renderTrendChartForMonth();
    renderMonthlyReport([]);
    return;
  }

  // Group by month (YYYY-MM)
  const groups = {};
  records.forEach((r) => {
    const ym = r.date.slice(0, 7);
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(r);
  });

  // Render each month group as a collapsible section
  const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  sortedMonths.forEach((ym) => {
    const monthRecords = groups[ym];
    const [, m] = ym.split("-");
    const monthLabel = `${Number(m)}月`;

    const group = document.createElement("div");
    group.className = "record-month-group";
    group.innerHTML = `
      <button class="record-month-header" type="button" data-month="${ym}">
        <span class="record-month-title">${ym.slice(0,4)}年${monthLabel}</span>
        <span class="record-month-count">${monthRecords.length} 条</span>
        <span class="record-month-arrow">▾</span>
      </button>
      <div class="record-month-body"></div>
    `;

    const body = group.querySelector(".record-month-body");
    monthRecords.forEach((record) => {
      const card = document.createElement("article");
      card.className = "record-card";
      const modeTag = record.mode === "holiday"
        ? '<span class="tag yellow">假期</span>'
        : '<span class="tag blue">在校</span>';
      const subText = record.mode === "holiday" ? "假期剩余" : "距发生活费";
      card.innerHTML = `
        <div class="record-head">
          <div>
            <div class="record-date">${formatRecordDate(record.date)} ${modeTag}</div>
            <div class="record-sub">${subText} ${record.daysUntilLivingFee} 天，每天可用</div>
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
      body.append(card);
    });

    // Collapse by default (except current month)
    const nowYM = new Date().toISOString().slice(0, 7);
    if (ym !== nowYM) {
      group.querySelector(".record-month-body").style.display = "none";
      group.querySelector(".record-month-arrow").textContent = "▸";
    }

    recordsList.append(group);
  });

  renderTrendChartForMonth();
  renderMonthlyReport(records);
}

// ── Trend chart month filtering ──
function getTrendMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + trendMonthOffset, 1);
  return { year: d.getFullYear(), month: d.getMonth(), ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
}

function renderTrendChartForMonth() {
  const tm = getTrendMonth();
  const allRecords = state.dailyRecords.slice();
  const monthRecords = allRecords
    .filter((r) => r.date.startsWith(tm.ym))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Update label
  const label = $("#trendMonthLabel");
  if (label) label.textContent = `${tm.year}年${tm.month + 1}月`;

  // Disable nav at boundaries
  const oldestYM = allRecords.length ? allRecords.reduce((min, r) => r.date.slice(0, 7) < min ? r.date.slice(0, 7) : min, "9999-99") : tm.ym;
  const nowYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const prevBtn = $("#trendMonthPrev");
  const nextBtn = $("#trendMonthNext");
  if (prevBtn) prevBtn.disabled = tm.ym <= oldestYM;
  if (nextBtn) nextBtn.disabled = tm.ym >= nowYM;

  if (monthRecords.length < 2) {
    // Not enough data for this month — show fallback
    const container = $("#trendChart");
    if (container) {
      container.innerHTML = `<div class="trend-empty">${monthRecords.length === 0 ? "本月无记录" : "本月仅 1 条记录，需 2 条以上"}</div>`;
    }
    return;
  }

  renderTrendChart(monthRecords);
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

// ── P2: Trend chart (pure SVG, zero dependencies) ──
function renderTrendChart(records) {
  const container = $("#trendChart");
  if (!container) return;

  // records are sorted desc; we need asc for the chart
  const sorted = records.slice().sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) {
    container.innerHTML = `<div class="trend-empty">保存 2 条以上记录即可显示余额走势</div>`;
    return;
  }

  const W = 320;
  const H = 150;
  const PAD_L = 46;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 26;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const values = sorted.map((r) => r.totalBalance);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Add 8% padding so line doesn't touch edges
  const minV = Math.min(dataMin - (dataMax - dataMin) * 0.08, 0);
  const maxV = dataMax + (dataMax - dataMin) * 0.08 || dataMax + 1;
  const range = maxV - minV || 1;

  const n = sorted.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const points = sorted.map((r, i) => {
    const x = PAD_L + i * xStep;
    const y = PAD_T + plotH - ((r.totalBalance - minV) / range) * plotH;
    return { x, y, date: r.date, value: r.totalBalance };
  });

  // Smooth curve using Catmull-Rom → cubic bezier
  function smoothPath(pts) {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const t = 0.18; // tension: lower = smoother
      const c1x = p1.x + (p2.x - p0.x) * t;
      const c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t;
      const c2y = p2.y - (p3.y - p1.y) * t;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  const linePath = smoothPath(points);
  const areaPath = linePath +
    ` L ${points[n - 1].x.toFixed(1)} ${(PAD_T + plotH).toFixed(1)}` +
    ` L ${points[0].x.toFixed(1)} ${(PAD_T + plotH).toFixed(1)} Z`;

  // Grid lines (4 horizontal)
  const gridLines = [];
  for (let g = 0; g <= 3; g++) {
    const y = PAD_T + (plotH / 3) * g;
    const val = maxV - (range / 3) * g;
    gridLines.push({ y, label: money(val), val });
  }

  // X-axis labels (first, middle, last)
  const xLabels = [];
  if (n <= 4) {
    points.forEach((p) => {
      const [, , d] = p.date.split("-");
      xLabels.push({ x: p.x, text: String(Number(d)) });
    });
  } else {
    [points[0], points[Math.floor((n - 1) / 2)], points[n - 1]].forEach((p) => {
      const [, , d] = p.date.split("-");
      xLabels.push({ x: p.x, text: String(Number(d)) });
    });
  }

  // Determine color based on trend (up=mint, down=red, flat=mint)
  const trend = points[n - 1].value - points[0].value;
  const lineColor = trend < -0.01 ? "#f87171" : "#5eead4";
  const glowColor = trend < -0.01 ? "rgba(248,113,113,0.35)" : "rgba(94,234,212,0.35)";

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs>
    <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.28"/>
      <stop offset="60%" stop-color="${lineColor}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
    </linearGradient>
    <filter id="trendGlow" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  // Grid
  gridLines.forEach((g) => {
    svg += `<line x1="${PAD_L}" y1="${g.y.toFixed(1)}" x2="${W - PAD_R}" y2="${g.y.toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="2 3"/>`;
    svg += `<text class="trend-axis-label" x="${PAD_L - 6}" y="${(g.y + 3).toFixed(1)}" text-anchor="end">${g.label}</text>`;
  });

  // Area fill
  svg += `<path d="${areaPath}" fill="url(#trendArea)"/>`;

  // Glow line (behind main line)
  svg += `<path d="${linePath}" fill="none" stroke="${glowColor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" filter="url(#trendGlow)"/>`;

  // Main line with draw-in animation
  svg += `<path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

  // Dots with pulse on last point
  points.forEach((p, i) => {
    const isLast = i === n - 1;
    if (isLast) {
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="${lineColor}" opacity="0.2"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${lineColor}"/>`;
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2" fill="#08090f"/>`;
    } else {
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#0e1119" stroke="${lineColor}" stroke-width="2"/>`;
    }
  });

  // Last value label badge
  const lastP = points[n - 1];
  const badgeY = lastP.y < 30 ? lastP.y + 20 : lastP.y - 12;
  svg += `<text x="${lastP.x.toFixed(1)}" y="${badgeY.toFixed(1)}" text-anchor="middle" fill="${lineColor}" font-size="11" font-weight="700">${money(lastP.value)}</text>`;

  // X-axis labels
  xLabels.forEach((l) => {
    svg += `<text class="trend-axis-label" x="${l.x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${l.text}</text>`;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

// ── P2: Monthly report ──
function renderMonthlyReport(records) {
  const container = $("#monthlyReport");
  const label = $("#reportMonthLabel");
  if (!container) return;

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthRecords = records.filter((r) => r.date.startsWith(yearMonth));

  if (label) {
    const [, m] = yearMonth.split("-");
    label.textContent = `${Number(m)}月`;
  }

  if (!monthRecords.length) {
    container.innerHTML = `<div class="trend-empty">本月还没有记录</div>`;
    return;
  }

  const dailyAmounts = monthRecords.map((r) => r.dailyCanUse);
  const totalBalances = monthRecords.map((r) => r.totalBalance);
  const avgDaily = dailyAmounts.reduce((s, v) => s + v, 0) / dailyAmounts.length;
  const maxBalance = Math.max(...totalBalances);
  const minBalance = Math.min(...totalBalances);
  const firstBalance = monthRecords.slice().sort((a, b) => a.date.localeCompare(b.date))[0].totalBalance;
  const lastBalance = monthRecords.slice().sort((a, b) => b.date.localeCompare(a.date))[0].totalBalance;
  const change = lastBalance - firstBalance;

  container.innerHTML = `
    <div class="report-grid">
      <div class="report-item">
        <div class="report-item-label">本月记录</div>
        <div class="report-item-value mint">${monthRecords.length}<span style="font-size:14px;color:var(--muted)"> 条</span></div>
      </div>
      <div class="report-item">
        <div class="report-item-label">平均每天可用</div>
        <div class="report-item-value blue">${money(avgDaily)}</div>
      </div>
      <div class="report-item">
        <div class="report-item-label">余额变化</div>
        <div class="report-item-value ${change >= 0 ? "mint" : "red"}">${change >= 0 ? "+" : ""}${money(change)}</div>
        <div class="report-item-sub">${money(firstBalance)} → ${money(lastBalance)}</div>
      </div>
      <div class="report-item">
        <div class="report-item-label">最高 / 最低</div>
        <div class="report-item-value yellow">${money(maxBalance)}<span style="font-size:14px;color:var(--muted)"> / ${money(minBalance)}</span></div>
      </div>
    </div>
  `;
}

$("#debtForm").addEventListener("submit", (event) => {
  event.preventDefault();
  syncDebtForm();
  saveState();
  renderAll();
});

$("#noteForm2").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("#noteTextInput").value.trim();
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
  const days = getDivisorDays();
  const divisor = Math.max(1, days);
  const record = {
    id: createId(),
    date: today,
    mode: state.mode,
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
  // Toggle month group
  const header = event.target.closest(".record-month-header");
  if (header) {
    const body = header.nextElementSibling;
    const arrow = header.querySelector(".record-month-arrow");
    const isHidden = body.style.display === "none";
    body.style.display = isHidden ? "" : "none";
    arrow.textContent = isHidden ? "▾" : "▸";
    return;
  }

  // Delete record
  const button = event.target.closest(".delete-record");
  if (!button) return;

  rememberState();
  state.dailyRecords = state.dailyRecords.filter((record) => record.id !== button.dataset.id);
  saveState();
  renderDailyRecords();
});

$("#clearRecordsButton").addEventListener("click", () => {
  if (!window.confirm("确定清空所有记录？")) return;
  rememberState();
  state.dailyRecords = [];
  saveState();
  renderDailyRecords();
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
    // 切换到绘图视图时初始化并重新计算画布尺寸
    if (button.dataset.view === "drawingView") {
      setTimeout(() => {
        initDrawing();
        if (typeof drawingApp !== "undefined" && drawingApp) drawingApp.resize();
      }, 120);
    }
  });
});

// ── Trend month navigation ──
$("#trendMonthPrev")?.addEventListener("click", () => {
  trendMonthOffset--;
  renderTrendChartForMonth();
});
$("#trendMonthNext")?.addEventListener("click", () => {
  trendMonthOffset++;
  renderTrendChartForMonth();
});

document.querySelectorAll(".mode-opt").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.mode === button.dataset.mode) return;
    rememberState();
    state.mode = button.dataset.mode;
    if (state.mode === "holiday" && !state.holidayStartDate) {
      state.holidayStartDate = new Date().toISOString().slice(0, 10);
    }
    saveState();
    renderAll();
  });
});

function switchView(viewId) {
  const current = document.querySelector(".app-view.active");
  const next = document.getElementById(viewId);
  if (next === current || !next) return;

  next.classList.add("active");
  current?.classList.remove("active");

  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  document.querySelector(`[data-view="${viewId}"]`).classList.add("active");
}

autoSaveFromForm("#debtForm", syncDebtForm);

["#syncTokenInput", "#syncGistInput"].forEach((selector) => {
  $(selector).addEventListener("input", () => {
    window.clearTimeout(syncFieldTimer);
    syncCloudForm({ remember: false });
    saveState({ upload: false, touch: false });
    renderSyncSettings();

    if (!canUseCloud()) {
      setSyncStatus("\u672A\u5F00\u542F", false);
      return;
    }

    setSyncStatus("\u6B63\u5728\u8FDE\u63A5...");
    syncFieldTimer = window.setTimeout(() => {
      pullCloudState({ force: true });
    }, 600);
  });
});

$("#installmentNote").addEventListener("click", () => {
  const nextNote = window.prompt("修改分期说明", state.installmentNote || $("#installmentNote").textContent);
  if (nextNote === null) return;
  rememberState();
  state.installmentNote = nextNote.trim();
  saveState();
  renderAll();
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
    // 先读云端最新状态，避免覆盖新数据
    const checkResp = await fetch(`https://api.github.com/gists/${state.sync.gistId}`, {
      headers: getGithubHeaders(),
    });
    if (checkResp.ok) {
      const gist = await checkResp.json();
      const file = gist.files?.["licai-data.json"];
      if (file?.content) {
        const cloudState = normalizeState(JSON.parse(file.content));
        const cloudUpdatedAt = Number(cloudState.sync?.updatedAt || 0);
        // 云端数据比本地新 → 拒绝推送，改为拉取
        if (cloudUpdatedAt > state.sync.updatedAt) {
          setSyncStatus("云端有更新，正在拉取...");
          applyCloudState(cloudState);
          setSyncStatus(`已拉取云端 ${formatSyncTime(cloudUpdatedAt)}`);
          return;
        }
      }
    }

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
    setSyncStatus("同步中...");
    const response = await fetch(`https://api.github.com/gists/${state.sync.gistId}`, {
      headers: getGithubHeaders(),
    });
    if (!response.ok) throw new Error(`下载失败 ${response.status}`);
    const gist = await response.json();
    const file = gist.files?.["licai-data.json"];
    if (!file?.content) throw new Error("云端无数据");
    const cloudState = normalizeState(JSON.parse(file.content));
    const cloudUpdatedAt = Number(cloudState.sync?.updatedAt || 0);

    if (force) {
      // 手动拉取：仍然保护——如果云端比本地旧，提示但不覆盖
      if (cloudUpdatedAt < state.sync.updatedAt) {
        setSyncStatus(`云端较旧，未覆盖（本地 ${formatSyncTime(state.sync.updatedAt)}）`);
        return;
      }
    } else {
      // 自动同步：云端必须严格更新才拉取
      if (cloudUpdatedAt <= state.sync.updatedAt) {
        setSyncStatus(`已是最新 ${formatSyncTime(state.sync.updatedAt)}`);
        return;
      }
    }
    rememberState();
    applyCloudState(cloudState);
    setSyncStatus(`已同步 ${formatSyncTime(state.sync.updatedAt)}`);
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
// 温和轮询：60 秒一次（替代原来激进的 5 秒）
setInterval(() => pullCloudState(), 60_000);

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

// 版本号显示（设置页）：从 SW cacheName 读取当前运行版本，帮助排查旧缓存
(function showVersion() {
  const tag = document.getElementById("appVersionTag");
  if (!tag) return;
  let v = "未知";
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    const scriptURL = navigator.serviceWorker.controller.scriptURL || "";
    const m = scriptURL.match(/v(\d+)/);
    if (m) v = "v" + m[1];
  } else if (location.protocol === "http:" && location.hostname !== "localhost") {
    // 无 SW 控制时退回 HTML 引用版本
    const scripts = Array.from(document.querySelectorAll("script[src*='?v=']"));
    const m = scripts.length && scripts[0].src.match(/v=(\d+)/);
    if (m) v = "v" + m[1];
  } else if (location.hostname === "localhost") {
    const scripts = Array.from(document.querySelectorAll("script[src*='?v=']"));
    const m = scripts.length && scripts[0].src.match(/v=(\d+)/);
    if (m) v = "v" + m[1] + " (本地)";
  }
  tag.textContent = "当前版本：" + v + " · 若与最新不符，请清除浏览器网站数据后重开";
})();
