# AGENTS.md — 记账 App 跨对话共享上下文

> **用途**：此文件会被 Hermes 自动注入到本项目目录下所有对话的系统提示中。
> 两个对话（GLM / DeepSeek）都能读到这份文件，确保信息互通。
> **每次修改完成后，助手必须更新本文件的「最近变更」和「当前版本」。**

## 项目概述

- **名称**：记账 App（零依赖 PWA）
- **路径**：`D:\桌面\项目\记账软件`
- **线上**：https://hejunhao12366.github.io/hejunhao0512.github.io/
- **仓库**：`hejunhao12366/hejunhao0512.github.io`（main 分支）
- **定位**：总余额快照工具（不是分类记账），支持余额走势图、每日记录、倒计时、绘图模块

## 技术栈

- **纯前端 PWA**，零框架、零构建工具、零 npm 依赖
- 唯一外部 CDN：roughjs@4.6.6（绘图模块手绘风格，`drawing.js` 中加载）
- **暗色主题**（玻璃拟态），移动优先，`max-width: 480px`
- 数据存储：localStorage
  - 记账数据：`mobile-ledger-state-v3`
  - 绘图数据：`drawing-data-v2`
- 云同步：GitHub Gist API

## 文件结构

| 文件 | 职责 |
|------|------|
| `index.html` | 主页面结构，5 个底部导航 tab（计算/记录/任务/导航/设置） |
| `styles.css` | 全部样式。**零 @media 断点**（iOS Safari pinch-zoom 会触发布局偏移） |
| `app.js` | 记账核心逻辑：模式切换、余额计算、记录管理、走势图、倒计时、Gist 同步 |
| `drawing.js` | 绘图模块 v2：Canvas + roughjs，世界坐标、缩放平移、命中检测、撤销重做 |
| `service-worker.js` | PWA 离线缓存。版本号格式 `mobile-ledger-v{N}` |
| `manifest.webmanifest` | PWA 清单 |
| `icon.svg` | 渐变 SVG 图标 |
| `dev-preview.html` | **开发预览工具（gitignore，勿推送）**：iPhone 14 Pro 393×852 等比手机壳，同源 iframe 注入安全区模拟（顶59/底34px），还原灵动岛/状态栏/Home条，自动清 SW 缓存+服务器自愈 |

## 本地预览（开发调试）

- 启动：`启动iPhone预览.ps1`（或 `python -m http.server 8770`）
- 访问：`http://localhost:8770/dev-preview.html`（手机壳版，1:1 还原 iPhone 14 Pro）
- 或直接 `http://localhost:8770/index.html`（裸页面）
- 真机：iPhone 连同一 Wi-Fi 访问 `http://电脑IP:8770`

## 当前版本

- **PWA 缓存**：`v96`
- **HTML asset 版本**：`?v=96`（styles.css / app.js / drawing.js）
- **最新 commit**：`82e3246` — 外观可切换浅色/深色（v96）

## ⚠️ 修改规则（每次改动必须遵守）

1. **改 CSS/JS 后**：递增 cache 版本（`v89`→`v90`），同步更新 3 处：
   - `service-worker.js` 的 `cacheName`
   - `service-worker.js` 的 assets 列表（`?v=90`）
   - `index.html` 的 `<link>` / `<script>` 标签（`?v=90`）
2. **验证**：用 Node 脚本做静态检查（语法 + 关键内容存在性），确保通过后再推送
3. **推送**：`git push` 被墙（git insteadOf 镜像规则），用 **GitHub REST API** 推送：
   - 脚本模板：写 Python 脚本到 `D:\tmp\hermes-push.py`，用后即删
   - Token：`C:\Users\ZhuanZ\bin\gh.exe auth token`
   - 流程：create blobs → create tree → create commit → update ref
4. **推送后**：更新本文件的「当前版本」和「最近变更」
5. **推送无需等用户确认**（用户明确要求自动推送）
6. **本文件写入无需批准**（2026-08-31 起）：已关闭 Hermes 的 `security.protected_instruction_files` 保护，AGENTS.md 可直接写入，不再弹批准窗。如需恢复：`hermes config set security.protected_instruction_files true`

## 🚨 版本推送 SOP（新会话必读，按此执行勿再摸索）

**双对话并行警告**：GLM/DeepSeek 两个会话同时维护本仓库，远程可能领先本地 commit。

1. **改代码前**：先查远程版本，以远程为准：
   ```bash
   curl -s "https://api.github.com/repos/hejunhao12366/hejunhao0512.github.io/contents/service-worker.js?ref=main" | python -c "import json,sys,base64;print(base64.b64decode(json.load(sys.stdin)['content']).decode())" | grep cacheName
   ```
   若远程版本 > 本地：先拉远程文件对齐（`curl ... contents/<文件>?ref=main` 逐个对比覆盖本地），再开始改。
2. **bump 版本必须是独立命令，禁止与验证 && 串联**：
   ```bash
   # ✅ 正确：分开执行，各自确认输出
   sed -i 's/mobile-ledger-v82/mobile-ledger-v83/; s/?v=82/?v=83/g' service-worker.js index.html
   grep -o "mobile-ledger-v[0-9]*" service-worker.js   # 确认 bump 成功
   # ❌ 错误：node verify.js && sed ... —— 验证退出码非 0 会断链，sed 静默不执行
   ```
   （历史事故：v71 时 sed 被 && 断链，版本没 bump → URL 不变 → 手机缓存永不失效，用户反复看到旧版，排查了三轮）
3. **只改文件内容不改 ?v=N = 白改**：浏览器和 SW 都按 URL 缓存，URL 不变永远命中旧文件。任何 JS/CSS 改动必须 bump。
4. **推送后必须线上确认**（GitHub Pages CDN 有延迟，sleep 15-20s 再查）：
   ```bash
   curl -s "https://hejunhao12366.github.io/hejunhao0512.github.io/service-worker.js" | grep -o "mobile-ledger-v[0-9]*"
   ```
   显示新版本号才算推送完成。
5. **更新 AGENTS.md「当前版本」+ 变更日志**，并推送（AGENTS.md 写入需用户批准弹窗，批准后正常推）。
6. **告知用户刷新方式**：设置页底部「当前版本」是诊断入口；旧缓存需 iOS Safari 清除历史记录与网站数据；SW 更新需完全关闭 App 重开（首开下载、二开激活）。

## iOS Safari 已知坑（务必避免）

| 坑 | 原因 | 解决方案 |
|----|------|----------|
| 设置页缩放偏移 | `@media` 断点在 pinch-zoom 时 innerWidth 变小误触发 | **零 @media 断点**，已全部删除 |
| `:root` 变量丢失 | 绘图模块 `#drawingCanvas` 规则错误放在 `:root` 内 | 确保 `#drawingCanvas` 在 `:root` 闭合之后 |
| grid 变单列 | 删 @media 时引入的 `grid-template-columns:1fr` 覆盖了 `1fr 1fr` | 不要新增任何 grid 列数覆盖 |
| 表单元素 min-width | `fieldset` 默认 min-width:0 不生效 | 用 `div` 替代 `fieldset` |
| 原生 checkbox 渲染黑块 | iOS 暗色主题下原生 checkbox 显示黑色大圆角方块，`accent-color` 在 iOS 不生效 | `appearance:none` + `-webkit-appearance:none` 完全自绘（圆角边框+薄荷绿底+SVG data-URI 白对勾）。⚠️ 自绘后必须同时重置全局 `input,textarea,select` 规则的 `padding:0; min-width:0; min-height:0`，否则 checkbox 会吃 padding 且被 flex `min-width:auto` 撑大到 30×46 |

## 记账功能详情

### 模式
- **在校模式**：生活费、还款、余额计算
- **假期模式**：倒计时（会动态倒数天数），日期从 `holidayStartDate` + `holidayDays` 计算

### 走势图（app.js `renderTrendChart`）
- SVG 折线图，Catmull-Rom 平滑曲线 + 渐变填充 + 发光线条
- **月切换器**：`‹ 2026年7月 ›`，`trendMonthOffset` 控制偏移（0=当月）
- 按选定 YYYY-MM 过滤记录，<2 条则显示空状态
- 趋势感知颜色：涨/平=薄荷绿 `#5eead4`，跌=红色

### 每日记录
- 按月分组折叠（`record-month-group` / `record-month-header`）
- localStorage key `mobile-ledger-state-v3`，结构含 `dailyRecords[]`

## 绘图模块 v2 详情

### 工具列表（`data-tool`）
pen（画笔）、rectangle、circle、line（直线）、arrow、text、select（选择/移动）

### 核心机制
- **世界坐标系**：`screenToWorld()` 转换，支持 `scale` / `offsetX` / `offsetY`
- **全屏画布**：`.drawing-view` 用 `position:fixed; inset:0` 全屏覆盖（v52+），脱离 app-shell padding
- **工具栏**：`flex-wrap:nowrap; overflow-x:auto` 横向滚动，不换行（v52+，解决手机端重叠）
- **缩放**：双指捏合（`onPinch`，v52+ 重写 touchstart/touchmove/touchend 三阶段管理 `_pinchActive`/`_lastPinchDist`）、滚轮、工具栏按钮
- **平移**：select 工具下点击空白 → 拖拽平移画布
- **命中检测**：12px 屏幕空间容差，`_distToSegment` 用于 pen/line/arrow
- **选中框**：虚线边框 + 四角圆形手柄（`drawSelection`），四角可拖拽缩放（`_getHandleAt`/`_resizeElement`，v52+）
- **浮动操作栏**：选中元素时底部弹出删除/复制按钮（`_updateFloatingBar`，v52+，手机端友好）
- **撤销/重做**：50 步栈，Ctrl+Z / Ctrl+Y
- **网格切换**：`toggleGridBtn`，暗色网格 `rgba(255,255,255,0.04)`
- **颜色**：stroke/fill 颜色选择器作用于所有工具（包括 text/arrow）
- **存储**：`drawing-data-v2`（含 elements + viewport 状态）

### CSS 布局
- `.drawing-view`：flex column，`height: calc(100vh - 120px)`
- `.drawing-toolbar`：flex-wrap，36px 工具按钮，group 间分隔线
- `.drawing-canvas-wrap`：`flex: 1`，填满剩余空间

## Git 信息

- **origin**：`https://github.com/hejunhao12366/hejunhao0512.github.io.git`
- **推送方式**：GitHub REST API（api.github.com 直连），非 git push
- **gh CLI**：`C:\Users\ZhuanZ\bin\gh.exe`
- **全局 insteadOf**：`https://ghfast.top/https://github.com/` → 不删除（用户故意设置）

## 最近变更日志（最新在上）

| 日期 | Commit | 内容 |
|------|--------|------|
| 2026-11-25 | `82e3246` | **外观可切换浅色/深色 + 修脏灰框（v96）**：用户反馈浅色太亮、每天可用大数字框发灰，遂做主题切换（其本人提议）。①修 bug：`.daily-highlight` 背景第二层残留深色版 `rgba(0,0,0,0.15)` 打底（v95 分层简写未被映射覆盖），浅色改 `#f5f8ff`、warning 改 `#fff6f5`。②主题系统：浅色 = `:root` 默认；深色 = `[data-theme="dark"]` 变量覆盖（iOS 深色规范：底 `#000`、卡 `#1c1c1e`、主色 `#0a84ff`、语义色深色变体）+ 组件覆盖层（输入框/凹槽/导航/画图工具栏/模式轨道/复选框等 v95 写死的黑白叠层逐项反转）。设置页新增「外观」卡（浅色/深色分段按钮 `.theme-switch`）；主题只存本机 localStorage `mobile-ledger-theme-v1`（与隐私模式同模式，**不进 state、不随云同步**，按设备记）；index.html 头部内联脚本在 CSS 前套用主题防闪白，applyTheme 同步 `theme-color` meta 并重渲染；两张 SVG 图的网格线/数据点底色经 `chartGridColors()` 随主题切换。静态+功能验证 18/18（深/浅两套图表配色实测）；线上确认 SW 已切 v96、线上 CSS 含深色覆盖层 |
| 2026-11-25 | `16d3c9f` | **苹果风浅色换皮（v95）**：用户选定 C 方案（iOS 风）后整体换皮，**只改样式与颜色常量，不动任何功能/数据**。styles.css 变量全量映射：`color-scheme: light`、页面底 `#f2f2f7`、卡片纯白、文字 `#1c1c1e/#3a3a3c`、次要文字 iOS 灰、主色 `#007aff`、语义色换 iOS 系统色（绿 `#34c759`/红 `#ff3b30`/橙 `#ff9500`/紫 `#af52de`）、阴影大幅减淡、去掉 body 深色径向光晕。硬编码颜色分层映射：白色叠层（65 处）按透明度档位翻为黑色叠层、黑色凹槽改浅灰填充、旧薄荷绿/蓝/紫/红/黄 rgba 家族统一换 iOS 色值；底部导航改白色半透明 + 激活项浅蓝胶囊（不再实心填充），花完预警安全徽标改显式 iOS 绿（主色变蓝后不能再跟 var(--mint)）。⚠️ 映射教训：先插入的白色半透明面（导航/画图工具栏）会被后续正则二次翻转成黑色，交付前必须专项扫描 `rgba(0,0,0,0.88/0.92/0.94)` 这类高透明黑面并逐个核对语义。app.js 图表配色同步：走势线涨绿跌红、预警图实线蓝/推算虚线按档位绿橙红、发钱日紫线、网格改黑色低透明、数据点白底；画图默认笔色与导航图标色板换 iOS 蓝系；drawing.js 默认色 `#0d9488`→`#007aff`。index.html `theme-color`、manifest 背景/主题色、icon.svg 均同步浅色。静态验证 18/18 + 预警图逻辑测试全过；线上确认 SW 已切 v95、线上 CSS 为浅色变量 |
| 2026-11-25 | `d47d160` | **花完预警图（v94）**：预警卡下方新增纯 SVG 图 `#forecastChart`（复用 `.trend-chart-container` 与 `.trend-axis-label` 样式）：实线 = 最近 8 天窗口内实际余额（与预警同一口径，按日历日定位 x 而非记录序号）；虚线 = 从今天余额按日均花销直线推算到 0，颜色随预警档位（安全薄荷绿/刚好黄/危险红）；紫色竖虚线标发钱日（假期模式标假期结束），推算见底日在图范围内时另标「预计花完 M/D」竖线与日期；时间轴终点 = max(发钱日, 预计花完日)，runway 封顶 45 天防图拉爆；图下图例注明实线/虚线含义（日均金额走 `fmtMoney` 与隐私模式一致）。预警数据不足时图容器清空。静态验证 11/11 + 图表逻辑测试 10/10（危险/安全/刚好三档颜色、发钱与花完标记、稀疏记录空图、假期标签、45 天封顶）；线上确认 SW 已切 v94、线上 app.js 含 `renderForecastChart` |
| 2026-11-25 | `4ddafd6` | **花完预警 + 存钱目标卡（v93）**：用户明确拒绝逐笔「记一笔」（工作流是晚上回宿舍看各账户余额直接填总数），两个新功能都只吃现有每日记录快照、零新增输入。①花完预警（计算页新卡 `#forecastBody`）：`getSpendForecast()` 只统计完整落在最近 8 天内、且余额下降的记录区间（发钱/收入日余额上升不算花销；跨界长区间整段剔除，否则十几天落差会污染日均——逻辑测试 case5 踩过此坑），日均花销 = 下降总额 ÷ 下降天数；还能撑天数 = 总余额 ÷ 日均。与 `getDivisorDays()` 目标日比较三档：≥目标+2 安全（薄荷绿）/ ≥目标 刚好（黄）/ <目标 危险（红，给出预计花完日期、早几天、每天最多花多少、日均要降多少）。记录 <3 条或下降天数 <2 时显示攒记录提示。②存钱目标卡（计算页新卡 `#savingsBody`）：`state.savingsGoal` 单目标 `{name,target,saved}`，`normalizeSavingsGoal()` 归一化（对象才保留，target=0 不丢目标防误编辑丢数据；旧存档/云端无此字段自动为 null 不影响迁移）；已存/目标金额复用全局 `.editable-value` 行内编辑（path=`savingsGoal.saved/target`），名称/新建/删除走 prompt/confirm（同欠款项模式，名称 `escapeHtml`）；进度条复用 `.repay-progress` 类。静态验证 20/20 + 预警算法逻辑测试 5/5（稳态花销/收入日/记录不足/隔日记录/窗口外旧记录）；线上确认 SW 已切 v93、线上 app.js 含新函数、首页含两新卡容器。顺手修正本文件文件结构表过时的「4 个底部导航」描述 |
| 2026-11-25 | `2b21ba4` | **导航图标长按拖动排序（v92）**：①触摸长按 500ms 进入拖动（图标放大浮起 `.dragging`），移动时 `elementFromPoint` 实时重排 DOM，松手按 DOM 顺序重建 `navLinks` 并 `saveNavLinks()` 持久化；长按不移动直接松手仍打开编辑弹窗（原长按行为改到松手时触发）②桌面鼠标按住拖动（>6px）同样排序，拖后紧随的 click 由 `longFired`/`openedAt` 守卫吞掉③「+」添加按钮不参与排序，悬停其上 = 移到末尾；`touchcancel` 取消拖动并重渲染恢复④每项挂 `_linkRef` 回收链接对象，提交后 `renderLinksGrid()` 重绑下标。静态验证 16/16（语法+关键断言+零 @media）；线上确认 SW 已切 v92 |
| 2026-10-27 | `9f5653b` | **每天记录保存精确时间（v91）**：①「保存今日记录」新增 `time` 字段（本地 HH:MM:SS），记录卡片日期行显示 `10月27日 23:49:18 在校`（`.record-time` 小号灰字 tabular-nums），旧记录无 time 不显示②顺手修同类根因 bug：`toISOString()` 是 UTC——中国时区凌晨 0~8 点保存会记成前一天、月底保存可能归错月。统一改 `getLocalDateStr()` 本地日期，涉及 4 处：记录保存日期、记录月份分组默认展开判断、切假期模式的 `holidayStartDate`、`holidayEndDate`（+holidayDays 天，此前会偏早一天）。无头实测 11/11：时间格式/同日去重更新时间/刷新持久化/旧记录兼容/走势图正常；v90 欠款回归 12/12 |
| 2026-10-26 | `858cf30` | **总欠支持自定义欠款项（v90）**：数据模型改 `debtItems[]`（id/name/color/total/monthlyDue/plan），不再固定白条+花呗。①总欠卡片公式行带名称标签（`白条 2382.52 + 花呗 590.76 = ...`），金额仍可点选行内编辑（path=`debtItems.N.total`）②公式下方管理条：每项一个胶囊（点名称改名、✕删除带确认），末尾「＋添加欠款」（prompt 输入名称+金额），配色盘 red/blue/mint/purple/yellow 循环③还款计划弹窗动态渲染每项的 12 个月视图④旧 `debts`/`monthlyRepay`/`repayPlan` 自动迁移到 debtItems（id 固定 baitiao/huabei 保计划数据），且每次 saveState 刷新旧字段镜像——未升级的旧设备拉云存档不会清零白条/花呗⑤公式行 `formula-main` 改 `flex-wrap:wrap`（名称+金额 `.formula-group` 成组不拆散），多项时自动换行不再横向截断总和⑥修复：全新安装走 `clone(sampleState)` 不过 normalizeState 导致镜像缺失。无头实测 23/23：添加/改名/删除/撤销/刷新持久化/行内改数/弹窗3分区/进度累计/v89旧格式迁移全过；4项长名称 DOM 实测 0 重叠 0 溢出 |
| 2026-08-31 | `b8b03b3` | **修复导航点不了 + 阶段日期选择器失效（v89）**：①导航图标短按不跳转——v87 为拦截 iOS 长按选字加的 `touchstart preventDefault` 同时吞掉了合成 click；改为三通道互斥：touchend 派发跳转（600ms 防重复）+ 桌面 mouse click + 500ms 长按编辑 ②点「设目标日期」无反应——旧实现用隐藏 input，`showPicker()` 展开日历的瞬间 blur 处理器就把 input 移除导致选择器立即关闭；改为行内可见日期行（input + 确定/清除按钮），无 blur 竞态。无头实测：短按正确打开 17wanxiao URL、日期成功保存为 2026-10-15 且显示「剩 8 天」 |
| 2026-08-31 | `fc196af` | **任务行 label→div（v88）**：修复「点文字编辑时误触完成任务」——根因是任务行用 `<label>` 包裹 checkbox，行内任意点击都会转发给 checkbox。改 `<div>` 后：点文字=仅编辑、点方框=仅切换完成。无头实测：点文字后完成数不变+改名生效；点方框不弹 prompt |
| 2026-08-31 | `f921709` | **备忘录 5 项修复（v87）**：①任务可编辑（点文字改名称/提示）+ 可移动（↑↓按钮，边界禁用）②删除无用的静态 ⏱/💰 标签 ③阶段新增「📅 目标日期」（自定义日期选择器，显示剩余天数：剩N天/就是今天/已过N天）④导航长按改用 `passive:false` + `preventDefault`，iOS 不再选中文字（编辑弹窗 500ms 仍正常）⑤topbar 改 `align-items:flex-start` + `.top-actions flex-shrink:0`，撤销/恢复按钮在全部 5 页顶部 16px 完全平齐（此前 center 对齐+mode-switch 隐藏时漂移）。无头实测：移动生效、日期按钮渲染、UR top 计算页=设置页=16px |
| 2026-08-31 | `58426de` | **撤销微信/支付宝跳转（v86）**：用户决定不搞跳转 → 删除微信一键流、支付宝通道、帮助面板、copyText/showToast、wechat/alipay 标记、角标与开关样式，恢复「点击直接打开网站」。两个学校链接保留为普通链接。反向迁移 `mobile-ledger-links-migrate-v86` 清理手机上的「支付宝充值」残留 |
| 2026-08-31 | `c6f8a6e` | ~~支付宝充值通道（v85）~~ 已撤销 |
| 2026-08-31 | `3726651` | **微信链接一键流**（v84）：用户嫌 4 步面板麻烦 → 点击微信专属链接直接「自动复制 + 拉起微信 + 顶部 toast 提示」，用户只需在微信粘贴。复制失败才弹手动面板兜底。`copyText()`（clipboard+execCommand）/`showToast()`/`handleWechatLink()` |
| 2026-08-31 | `8597948` | **导航页微信专属学校网站**（v83）：新增「校园卡充值 💳」「智能水电 ⚡」默认链接（带绿色「微」角标）。原理：17wanxiao 系网站依赖微信公众号 OAuth，一次性 code 离开微信即失效（「用户不存在」）。链接编辑弹窗加「微信内打开」开关 |
| 2026-08-31 | `179c2a9` | **任务页「计划」层**（v80）：数据 v2 `{currentPlan, plans:[{name,currentStage,stages}]}`，旧数据自动迁移；计划横滑条 + ＋新计划 + 🗑删此计划；删除 FAB 下方「任务」文字 |
| 2026-08-31 | `f328236` | FAB 图标居中根治（v81）：`<span class="nav-fab-circle">` 真实圆容器 + svg 为 flex 子元素（align/justify center），CDP 实测 dx=0.00 dy=0.00 |
| 2026-08-31 | `d45d3e9` | 导航高亮修复（v79）：switchView 改防御式遍历（`Array.from(navBtns).find(b => b.dataset.view === viewId)`）；「每月发生活费日」改回数字输入 |
| 2026-08-31 | `c128cd3b` | **任务列表复选框 iOS 渲染 bug 已修复**：`.tasks-check-item input[type="checkbox"]` 加 `appearance:none` 完全自绘（圆角边框/未勾选半透明底/勾选薄荷绿 `#14b8a6`+SVG 白对勾）。关键坑：全局 `input` 规则 padding 11px 14px + flex `min-width:auto` 会把自绘 checkbox 撑到 30×46 → 必须 `padding:0; min-width:0; min-height:0`。已验证（Playwright 393×852 视口计算样式+点击切换+截图）。SW v82 |
| 2026-08-31 | 已确认 | 底部导航悬浮图标居中：代码层四边 16px 绝对居中；用户照片"偏移"为拍摄透视，非 bug |
| 2026-08-27 | `c302e1d` | 绘图：工具栏改单行横向滚动(修复按键重叠) + 画布改白色面板(网格/选中框/默认笔色适配白底) |
| 2026-08-10 | `1f72c44` | 假期模式：隐藏「还款后生活费」模块（school-only），总欠/还款计划保留 |
| 2026-08-10 | `645749d` | 绘图手机端修复：全屏画布、pinch缩放bug、四角resize手柄+浮动删除/复制栏、工具栏横向滚动 |
| 2026-07-30 | `64b1ace` | 还款计划：12个月视图 + 每月未还/✓已还切换按钮（进度=已还月份累计） |
| 2026-07-30 | `80e2ab3` | 还款计划弹窗：删手动按钮，改自动计算(逐月计划累计)，红蓝两路每月可自定义金额 |
| 2026-07-29 | `6cb7965` | 修复4问题：假期颜色(红+琥珀)、已还进度条逻辑(本月已还/待还)、自定义分期行、云同步覆盖保护 |
| 2026-07-29 | `715d42e` | Drawing v2：画笔/直线工具、世界坐标缩放平移、命中检测、撤销重做、网格切换 |
| 2026-07-28 | `b737bb3` | 走势图月切换器 |
| 2026-07-28 | `36417ba` | 走势图升级：平滑曲线、渐变填充、发光线条 |
| 2026-07-28 | `f182b9a` | 恢复 record-grid/report-grid 两列布局 |
| 2026-07-28 | `c227bf7` | 修复布局偏移：删除 @media(max-width:360px) + 修复 :root CSS 结构 |
