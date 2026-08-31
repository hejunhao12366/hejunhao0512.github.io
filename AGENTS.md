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
| `index.html` | 主页面结构，4 个底部导航 tab（计算/记录/绘图/设置） |
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

- **PWA 缓存**：`v82`
- **HTML asset 版本**：`?v=82`（styles.css / app.js / drawing.js）
- **最新 commit**：`c128cd3b` — 任务列表复选框 iOS Safari 渲染修复（v82）

## ⚠️ 修改规则（每次改动必须遵守）

1. **改 CSS/JS 后**：递增 cache 版本（`v54`→`v55`），同步更新 3 处：
   - `service-worker.js` 的 `cacheName`
   - `service-worker.js` 的 assets 列表（`?v=55`）
   - `index.html` 的 `<link>` / `<script>` 标签（`?v=55`）
2. **验证**：用 Node 脚本做静态检查（语法 + 关键内容存在性），确保通过后再推送
3. **推送**：`git push` 被墙（git insteadOf 镜像规则），用 **GitHub REST API** 推送：
   - 脚本模板：写 Python 脚本到 `D:\tmp\hermes-push.py`，用后即删
   - Token：`C:\Users\ZhuanZ\bin\gh.exe auth token`
   - 流程：create blobs → create tree → create commit → update ref
4. **推送后**：更新本文件的「当前版本」和「最近变更」
5. **推送无需等用户确认**（用户明确要求自动推送）

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
