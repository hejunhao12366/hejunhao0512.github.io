/**
 * 绘图模块 v2 — 手绘风格
 * Canvas + roughjs，世界坐标系，缩放平移，自由绘制
 */
(function loadRoughJS() {
  if (window.rough) return;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.min.js';
  document.head.appendChild(script);
})();

class DrawingApp {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    this.ctx = this.canvas.getContext('2d');
    this.rc = null;

    // ── 数据 ──
    this.elements = [];
    this.selectedId = null;
    this.hoverId = null;

    // ── 工具 ──
    this.currentTool = 'pen'; // pen, rectangle, circle, line, arrow, text, select
    this.strokeColor = '#0d9488';
    this.fillColor = 'transparent';
    this.strokeWidth = 2;

    // ── 视口（世界坐标→屏幕坐标）──
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.showGrid = true;

    // ── 交互状态 ──
    this.isDrawing = false;
    this.isDragging = false;
    this.isPanning = false;
    this.lastPointer = { x: 0, y: 0 };
    this.startPos = { x: 0, y: 0 };
    this.dragOffset = { x: 0, y: 0 };
    this.currentPath = null; // 自由绘制路径点

    // ── 撤销重做 ──
    this.undoStack = [];
    this.redoStack = [];

    this.storageKey = 'drawing-data-v2';

    this.init();
  }

  // ──────────────────────────────────────
  //  初始化
  // ──────────────────────────────────────
  init() {
    const checkRough = () => {
      if (window.rough) {
        this.rc = window.rough.canvas(this.canvas);
        this.resize();
        this.load();
        this.bindEvents();
        this.bindToolbarEvents();
        this.render();
      } else {
        setTimeout(checkRough, 100);
      }
    };
    checkRough();
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
  }

  // ──────────────────────────────────────
  //  坐标变换
  // ──────────────────────────────────────
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  // ──────────────────────────────────────
  //  Canvas 尺寸
  // ──────────────────────────────────────
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  // ──────────────────────────────────────
  //  事件绑定
  // ──────────────────────────────────────
  bindEvents() {
    // 统一指针事件（鼠标+触摸）
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    // 双指缩放 — 用 touch 事件独立管理，避免 pointer 交叉干扰
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        this._pinchActive = true;
        this._lastPinchDist = null; // 每次双指落下都重置基准
        // 中断正在进行的单指绘制
        if (this.isDrawing) {
          this.isDrawing = false;
          this.currentPath = null;
          this.previewEl = null;
        }
        this.onPinch(e.touches);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this._pinchActive) {
        e.preventDefault();
        this.onPinch(e.touches);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        this._pinchActive = false;
        this._lastPinchDist = null;
      }
    }, { passive: true });

    // 滚轮缩放（桌面端）
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoomAt(e.clientX, e.clientY, delta);
    }, { passive: false });

    // 键盘删除
    this._keyHandler = (e) => {
      const active = document.getElementById('drawingView');
      if (!active || !active.classList.contains('active')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedId !== null) {
          e.preventDefault();
          this.deleteSelected();
        }
      }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); this.redo(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  bindToolbarEvents() {
    const closeBtn = document.getElementById('closeDrawingBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      if (typeof switchView === 'function') switchView('calculatorView');
      else document.getElementById('drawingView').classList.remove('active');
    });

    document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTool(btn.dataset.tool);
        document.querySelectorAll('.tool-btn[data-tool]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const scp = document.getElementById('strokeColorPicker');
    if (scp) scp.addEventListener('input', (e) => { this.strokeColor = e.target.value; });

    const fcp = document.getElementById('fillColorPicker');
    if (fcp) fcp.addEventListener('input', (e) => { this.fillColor = e.target.value; });

    const sws = document.getElementById('strokeWidthSelect');
    if (sws) sws.addEventListener('change', (e) => { this.strokeWidth = parseInt(e.target.value); });

    const gridBtn = document.getElementById('toggleGridBtn');
    if (gridBtn) gridBtn.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      gridBtn.classList.toggle('active', this.showGrid);
      this.render();
    });

    const zoomInBtn = document.getElementById('zoomInBtn');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
      const r = this.canvas.getBoundingClientRect();
      this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2);
    });

    const zoomOutBtn = document.getElementById('zoomOutBtn');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
      const r = this.canvas.getBoundingClientRect();
      this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8);
    });

    const undoBtn = document.getElementById('drawUndoBtn');
    if (undoBtn) undoBtn.addEventListener('click', () => this.undo());

    const redoBtn = document.getElementById('drawRedoBtn');
    if (redoBtn) redoBtn.addEventListener('click', () => this.redo());
  }

  // ──────────────────────────────────────
  //  指针交互
  // ──────────────────────────────────────
  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onPointerDown(e) {
    // 双指缩放进行中，忽略单指
    if (e.pointerType === 'touch' && this._pinchActive) return;

    this.canvas.setPointerCapture(e.pointerId);
    const sp = this.getPos(e);
    this.lastPointer = sp;
    this.startPos = sp;
    const wp = this.screenToWorld(sp.x, sp.y);

    // 1) 先检测是否点击了选中元素的缩放手柄
    if (this.selectedId !== null && this.currentTool === 'select') {
      const handle = this._getHandleAt(wp.x, wp.y);
      if (handle) {
        this.isResizing = true;
        this.resizeHandle = handle;
        this.resizeStartBB = this._bbox(this.getElementById(this.selectedId));
        this.resizeStartWP = wp;
        this._pushUndoSnapshot();
        return;
      }
    }

    // 选择工具时点击空白则进入平移
    if (this.currentTool === 'select') {
      const el = this.getElementAt(wp.x, wp.y);
      if (el) {
        this.selectedId = el.id;
        this.isDragging = true;
        // pen 没有 x/y，用包围盒左上角做拖拽基准（_moveElement 内部同样按 bbox 偏移）
        if (el.type === 'pen') {
          const bb = this._bbox(el);
          this.dragOffset = { x: wp.x - bb.x, y: wp.y - bb.y };
        } else {
          this.dragOffset = { x: wp.x - el.x, y: wp.y - el.y };
        }
      } else {
        // 空白区域 → 平移画布
        this.selectedId = null;
        this.isPanning = true;
      }
      this.render();
      this._updateFloatingBar();
      return;
    }

    if (this.currentTool === 'text') {
      this.createText(wp.x, wp.y);
      return;
    }

    // 开始绘制
    this.isDrawing = true;
    this.startPos = wp;

    if (this.currentTool === 'pen') {
      this.currentPath = {
        id: this._uid(),
        type: 'pen',
        points: [{ x: wp.x, y: wp.y }],
        strokeColor: this.strokeColor,
        strokeWidth: this.strokeWidth,
      };
    } else {
      // 形状预览
      this.previewEl = {
        id: this._uid(),
        type: this.currentTool,
        x: wp.x,
        y: wp.y,
        width: 0,
        height: 0,
        strokeColor: this.strokeColor,
        fillColor: this.fillColor,
        strokeWidth: this.strokeWidth,
      };
    }
  }

  onPointerMove(e) {
    const sp = this.getPos(e);

    // 缩放元素
    if (this.isResizing && this.selectedId !== null) {
      const wp = this.screenToWorld(sp.x, sp.y);
      this._resizeElement(wp);
      this.render();
      return;
    }

    // 平移画布
    if (this.isPanning) {
      this.offsetX += sp.x - this.lastPointer.x;
      this.offsetY += sp.y - this.lastPointer.y;
      this.lastPointer = sp;
      this.render();
      return;
    }

    // 拖拽元素
    if (this.isDragging && this.selectedId !== null) {
      const wp = this.screenToWorld(sp.x, sp.y);
      const el = this.getElementById(this.selectedId);
      if (el) {
        this._moveElement(el, wp.x - this.dragOffset.x, wp.y - this.dragOffset.y);
        this.render();
      }
      return;
    }

    // 绘制中
    if (!this.isDrawing) return;
    const wp = this.screenToWorld(sp.x, sp.y);

    if (this.currentTool === 'pen' && this.currentPath) {
      const last = this.currentPath.points[this.currentPath.points.length - 1];
      const dist = Math.hypot(wp.x - last.x, wp.y - last.y);
      if (dist > 2) this.currentPath.points.push({ x: wp.x, y: wp.y });
      this.render();
    } else if (this.previewEl) {
      this.previewEl.width = wp.x - this.startPos.x;
      this.previewEl.height = wp.y - this.startPos.y;
      this.render();
    }
  }

  onPointerUp(e) {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      this.save();
      return;
    }
    if (this.isPanning) { this.isPanning = false; return; }
    if (this.isDragging) { this.isDragging = false; this.save(); this._updateFloatingBar(); return; }

    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentTool === 'pen' && this.currentPath) {
      if (this.currentPath.points.length > 1) {
        this.pushUndo();
        this.elements.push(this.currentPath);
      }
      this.currentPath = null;
    } else if (this.previewEl) {
      if (Math.abs(this.previewEl.width) > 3 || Math.abs(this.previewEl.height) > 3) {
        this.pushUndo();
        this.elements.push(this.previewEl);
      }
      this.previewEl = null;
    }

    this.save();
    this.render();
  }

  // ──────────────────────────────────────
  //  双指缩放
  // ──────────────────────────────────────
  onPinch(touches) {
    const rect = this.canvas.getBoundingClientRect();
    const t1 = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top };
    const t2 = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
    const dist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
    const cx = (t1.x + t2.x) / 2;
    const cy = (t1.y + t2.y) / 2;

    if (this._lastPinchDist) {
      const ratio = dist / this._lastPinchDist;
      const screenCX = cx + rect.left;
      const screenCY = cy + rect.top;
      this.zoomAt(screenCX, screenCY, ratio);
    }
    this._lastPinchDist = dist;
  }

  zoomAt(screenX, screenY, factor) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = screenX - rect.left;
    const sy = screenY - rect.top;
    const wp = this.screenToWorld(sx, sy);
    this.scale = Math.max(0.2, Math.min(5, this.scale * factor));
    // 保持鼠标点在世界坐标不变
    this.offsetX = sx - wp.x * this.scale;
    this.offsetY = sy - wp.y * this.scale;
    this.render();
  }

  // ──────────────────────────────────────
  //  命中检测（宽松版，带 padding）
  // ──────────────────────────────────────
  getElementAt(wx, wy) {
    const pad = 12 / this.scale; // 屏幕空间 12px 容差
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (this._hitTest(el, wx, wy, pad)) return el;
    }
    return null;
  }

  getElementById(id) {
    return this.elements.find((el) => el.id === id);
  }

  _hitTest(el, x, y, pad) {
    if (el.type === 'pen') {
      // 检测点是否靠近路径任一线段
      const pts = el.points;
      for (let i = 1; i < pts.length; i++) {
        if (this._distToSegment(x, y, pts[i - 1], pts[i]) < pad) return true;
      }
      return false;
    }
    if (el.type === 'text') {
      const w = (el.text || '').length * el.fontSize * 0.6;
      const h = el.fontSize;
      return x >= el.x - pad && x <= el.x + w + pad && y >= el.y - h - pad && y <= el.y + pad;
    }
    if (el.type === 'line' || el.type === 'arrow') {
      return this._distToSegment(x, y, { x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height }) < pad;
    }
    // rectangle, circle — bounding box
    const minX = Math.min(el.x, el.x + el.width) - pad;
    const maxX = Math.max(el.x, el.x + el.width) + pad;
    const minY = Math.min(el.y, el.y + el.height) - pad;
    const maxY = Math.max(el.y, el.y + el.height) + pad;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  _distToSegment(px, py, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
    let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  // ──────────────────────────────────────
  //  文本
  // ──────────────────────────────────────
  createText(x, y) {
    const text = prompt('输入文本：');
    if (!text) return;
    this.pushUndo();
    const el = {
      id: this._uid(),
      type: 'text',
      x, y,
      text,
      fontSize: 20,
      color: this.strokeColor,
    };
    this.elements.push(el);
    this.save();
    this.render();
  }

  // ──────────────────────────────────────
  //  删除 / 撤销 / 重做
  // ──────────────────────────────────────
  deleteSelected() {
    if (this.selectedId === null) return;
    this.pushUndo();
    this.elements = this.elements.filter((el) => el.id !== this.selectedId);
    this.selectedId = null;
    this._updateFloatingBar();
    this.save();
    this.render();
  }

  pushUndo() {
    this.undoStack.push(JSON.stringify(this.elements));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(JSON.stringify(this.elements));
    this.elements = JSON.parse(this.undoStack.pop());
    this.selectedId = null;
    this._updateFloatingBar();
    this.save();
    this.render();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(JSON.stringify(this.elements));
    this.elements = JSON.parse(this.redoStack.pop());
    this.selectedId = null;
    this._updateFloatingBar();
    this.save();
    this.render();
  }

  // ──────────────────────────────────────
  //  工具 / 样式设置
  // ──────────────────────────────────────
  setTool(tool) {
    this.currentTool = tool;
    this.selectedId = null;
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    this._updateFloatingBar();
    this.render();
  }

  // ──────────────────────────────────────
  //  渲染
  // ──────────────────────────────────────
  render() {
    if (!this.rc) return;
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.width / dpr;
    const H = this.canvas.height / dpr;

    this.ctx.save();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, W, H);

    // 背景色（白色面板）
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, W, H);

    // 应用世界坐标变换
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // 网格
    if (this.showGrid) this.drawGrid(W, H);

    // 绘制元素
    this.elements.forEach((el) => this.drawElement(el));

    // 绘制预览
    if (this.previewEl) this.drawElement(this.previewEl);
    if (this.currentPath) this.drawElement(this.currentPath);

    // 选中框
    if (this.selectedId !== null) {
      const el = this.getElementById(this.selectedId);
      if (el) this.drawSelection(el);
    }

    this.ctx.restore();

    // 缩放指示器（屏幕空间）
    this.ctx.save();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(`${Math.round(this.scale * 100)}%`, W - 12, H - 12);
    this.ctx.restore();
  }

  drawGrid(W, H) {
    const size = 25;
    // 计算可视世界坐标范围
    const wx1 = -this.offsetX / this.scale;
    const wy1 = -this.offsetY / this.scale;
    const wx2 = (W - this.offsetX) / this.scale;
    const wy2 = (H - this.offsetY) / this.scale;
    const x1 = Math.floor(wx1 / size) * size;
    const y1 = Math.floor(wy1 / size) * size;

    this.ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    this.ctx.lineWidth = 1 / this.scale;

    for (let x = x1; x <= wx2; x += size) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, wy1);
      this.ctx.lineTo(x, wy2);
      this.ctx.stroke();
    }
    for (let y = y1; y <= wy2; y += size) {
      this.ctx.beginPath();
      this.ctx.moveTo(wx1, y);
      this.ctx.lineTo(wx2, y);
      this.ctx.stroke();
    }
  }

  drawElement(el) {
    const opts = {
      stroke: el.strokeColor || '#0d9488',
      strokeWidth: el.strokeWidth || 2,
      roughness: 1.2,
      bowing: 1,
    };
    if (el.fillColor && el.fillColor !== 'transparent') opts.fill = el.fillColor;

    if (el.type === 'pen') {
      const pts = el.points;
      if (!pts || pts.length < 2) return;
      // 用 roughjs 的 linearPath / polygon
      for (let i = 1; i < pts.length; i++) {
        this.rc.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, opts);
      }
      return;
    }

    if (el.type === 'rectangle') {
      this.rc.rectangle(el.x, el.y, el.width, el.height, opts);
      return;
    }

    if (el.type === 'circle') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      this.rc.ellipse(cx, cy, Math.abs(el.width), Math.abs(el.height), opts);
      return;
    }

    if (el.type === 'line') {
      this.rc.line(el.x, el.y, el.x + el.width, el.y + el.height, opts);
      return;
    }

    if (el.type === 'arrow') {
      const x1 = el.x, y1 = el.y;
      const x2 = el.x + el.width, y2 = el.y + el.height;
      this.rc.line(x1, y1, x2, y2, opts);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const aSize = 14 + (el.strokeWidth || 2) * 2;
      const aa = Math.PI / 6;
      this.rc.line(x2, y2, x2 - aSize * Math.cos(angle - aa), y2 - aSize * Math.sin(angle - aa), opts);
      this.rc.line(x2, y2, x2 - aSize * Math.cos(angle + aa), y2 - aSize * Math.sin(angle + aa), opts);
      return;
    }

    if (el.type === 'text') {
      this.ctx.font = `${el.fontSize || 20}px "KaiTi","STKaiti",serif`;
      this.ctx.fillStyle = el.color || '#0d9488';
      this.ctx.fillText(el.text, el.x, el.y);
      return;
    }
  }

  drawSelection(el) {
    const bb = this._bbox(el);
    const pad = 6 / this.scale;
    this.ctx.strokeStyle = '#0d9488';
    this.ctx.lineWidth = 1.5 / this.scale;
    this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
    this.ctx.strokeRect(bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2);
    this.ctx.setLineDash([]);

    // 四角手柄（更大，方便触摸）
    const handles = this._handleWorldPos(bb);
    const hs = 7 / this.scale;
    this.ctx.fillStyle = '#0d9488';
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1.5 / this.scale;
    Object.values(handles).forEach((pos) => {
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, hs, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    });
  }

  // ── 选中元素的操作辅助 ──

  _handleWorldPos(bb) {
    const pad = 6 / this.scale;
    return {
      nw: { x: bb.x - pad, y: bb.y - pad },
      ne: { x: bb.x + bb.w + pad, y: bb.y - pad },
      sw: { x: bb.x - pad, y: bb.y + bb.h + pad },
      se: { x: bb.x + bb.w + pad, y: bb.y + bb.h + pad },
    };
  }

  _getHandleAt(wx, wy) {
    if (this.selectedId === null) return null;
    const el = this.getElementById(this.selectedId);
    if (!el) return null;
    const bb = this._bbox(el);
    const handles = this._handleWorldPos(bb);
    const hs = 14 / this.scale; // 14px 屏幕触控半径
    for (const [name, pos] of Object.entries(handles)) {
      if (Math.abs(wx - pos.x) < hs && Math.abs(wy - pos.y) < hs) return name;
    }
    return null;
  }

  _moveElement(el, newX, newY) {
    if (el.type === 'pen') {
      // 移动所有点
      const bb = this._bbox(el);
      const dx = newX - bb.x;
      const dy = newY - bb.y;
      el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      el.x = newX;
      el.y = newY;
    }
  }

  _resizeElement(wp) {
    const el = this.getElementById(this.selectedId);
    if (!el || !this.resizeStartBB) return;
    const sBB = this.resizeStartBB;
    const sWP = this.resizeStartWP;
    const handle = this.resizeHandle;

    // 死区：手指落在手柄上的天然抖动（<6px 屏幕距离）不触发缩放
    const dragDX = (wp.x - sWP.x) * this.scale;
    const dragDY = (wp.y - sWP.y) * this.scale;
    if (Math.hypot(dragDX, dragDY) < 6) return;

    // 新的边界框（世界坐标）
    let minX = sBB.x, minY = sBB.y, maxX = sBB.x + sBB.w, maxY = sBB.y + sBB.h;
    if (handle === 'se' || handle === 'ne') maxX = sBB.x + sBB.w + (wp.x - sWP.x);
    if (handle === 'sw' || handle === 'nw') minX = sBB.x + (wp.x - sWP.x);
    if (handle === 'se' || handle === 'sw') maxY = sBB.y + sBB.h + (wp.y - sWP.y);
    if (handle === 'ne' || handle === 'nw') minY = sBB.y + (wp.y - sWP.y);

    // 防止反转（宽高为负）
    if (maxX < minX) [minX, maxX] = [maxX, minX];
    if (maxY < minY) [minY, maxY] = [maxY, minY];

    // 尺寸钳制（24~4000 世界像素），锚定对角不动：
    // se→锚左上 / ne→锚左下 / sw→锚右上 / nw→锚右下
    const MIN = 24, MAX = 4000;
    let newW = Math.min(MAX, Math.max(MIN, maxX - minX));
    let newH = Math.min(MAX, Math.max(MIN, maxY - minY));
    if (handle === 'se') { maxX = minX + newW; maxY = minY + newH; }
    else if (handle === 'ne') { maxX = minX + newW; minY = maxY - newH; }
    else if (handle === 'sw') { minX = maxX - newW; maxY = minY + newH; }
    else { minX = maxX - newW; minY = maxY - newH; } // nw

    const oldW = Math.max(1, sBB.w);
    const oldH = Math.max(1, sBB.h);
    const sx = newW / oldW;
    const sy = newH / oldH;

    if (el.type === 'pen') {
      // 按比例缩放所有点
      el.points = el.points.map(p => ({
        x: minX + (p.x - sBB.x) * sx,
        y: minY + (p.y - sBB.y) * sy,
      }));
    } else if (el.type === 'text') {
      // 文字缩放字号
      const oldFS = el.fontSize || 20;
      el.fontSize = Math.max(10, Math.min(200, oldFS * sy));
      el.x = minX;
      el.y = minY + (el.fontSize || 20);
    } else {
      el.x = minX;
      el.y = minY;
      el.width = newW;
      el.height = newH;
    }
  }

  _pushUndoSnapshot() {
    this.undoStack.push(JSON.stringify(this.elements));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  // ── 浮动操作栏（选中元素时显示删除/复制按钮）──
  _updateFloatingBar() {
    let bar = document.getElementById('floatingActionBar');
    if (this.selectedId === null) {
      if (bar) bar.classList.remove('show');
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'floatingActionBar';
      bar.className = 'floating-action-bar';
      bar.innerHTML = `
        <button class="fab-btn" id="fabDelete" title="删除选中">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
        <button class="fab-btn" id="fabDuplicate" title="复制选中">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      `;
      document.getElementById('drawingView').appendChild(bar);
      bar.querySelector('#fabDelete').addEventListener('click', () => this.deleteSelected());
      bar.querySelector('#fabDuplicate').addEventListener('click', () => this.duplicateSelected());
    }
    bar.classList.add('show');
  }

  duplicateSelected() {
    if (this.selectedId === null) return;
    const el = this.getElementById(this.selectedId);
    if (!el) return;
    this.pushUndo();
    const clone = JSON.parse(JSON.stringify(el));
    clone.id = this._uid();
    if (clone.type === 'pen') {
      clone.points = clone.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
    } else {
      clone.x += 20;
      clone.y += 20;
    }
    this.elements.push(clone);
    this.selectedId = clone.id;
    this.save();
    this.render();
    this._updateFloatingBar();
  }

  _bbox(el) {
    if (el.type === 'text') {
      const w = (el.text || '').length * (el.fontSize || 20) * 0.6;
      return { x: el.x, y: el.y - (el.fontSize || 20), w, h: el.fontSize || 20 };
    }
    if (el.type === 'pen') {
      const xs = el.points.map((p) => p.x);
      const ys = el.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
    return {
      x: Math.min(el.x, el.x + el.width),
      y: Math.min(el.y, el.y + el.height),
      w: Math.abs(el.width),
      h: Math.abs(el.height),
    };
  }

  // ──────────────────────────────────────
  //  持久化
  // ──────────────────────────────────────
  save() {
    localStorage.setItem(this.storageKey, JSON.stringify({
      elements: this.elements,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    }));
  }

  load() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.elements = data.elements || [];
      if (data.scale) this.scale = data.scale;
      if (data.offsetX !== undefined) this.offsetX = data.offsetX;
      if (data.offsetY !== undefined) this.offsetY = data.offsetY;
    } catch (e) {
      this.elements = [];
    }
  }

  clear() {
    if (!confirm('确定清空画布？')) return;
    this.pushUndo();
    this.elements = [];
    this.selectedId = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._updateFloatingBar();
    this.save();
    this.render();
  }

  export() {
    const data = JSON.stringify({
      elements: this.elements,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drawing-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  import(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this.elements = data.elements || data;
        this.pushUndo();
        this.save();
        this.render();
      } catch (err) {
        alert('导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
  }

  _uid() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }
}

// ──────────────────────────────────────
//  全局接口
// ──────────────────────────────────────
let drawingApp = null;

function initDrawing() {
  if (!drawingApp) {
    drawingApp = new DrawingApp('drawingCanvas', 'drawingView');
  } else {
    // 已存在则重新 resize（视图切换时容器尺寸可能变化）
    setTimeout(() => drawingApp.resize(), 50);
  }
}

function clearDrawing() { drawingApp?.clear(); }
function exportDrawing() { drawingApp?.export(); }
function importDrawing() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => { if (drawingApp && e.target.files[0]) drawingApp.import(e.target.files[0]); };
  input.click();
}
