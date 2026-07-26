/**
 * 绘图模块 - 手绘风格
 * 基于 Canvas API + roughjs (手绘风格库)
 */

// 从 CDN 加载 roughjs
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
    this.rc = null; // rough canvas
    
    // 元素列表
    this.elements = [];
    this.selectedElement = null;
    this.currentTool = 'select'; // select, rectangle, circle, arrow, text
    
    // 交互状态
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    
    // 样式
    this.strokeColor = '#000000';
    this.fillColor = 'transparent';
    this.strokeWidth = 2;
    
    // 持久化
    this.storageKey = 'drawing-data';
    
    this.init();
  }
  
  init() {
    // 等待 roughjs 加载
    const checkRough = () => {
      if (window.rough) {
        this.rc = window.rough.canvas(this.canvas);
        this.resize();
        this.load();
        this.render();
        this.bindEvents();
        this.bindToolbarEvents();
      } else {
        setTimeout(checkRough, 100);
      }
    };
    checkRough();
    
    window.addEventListener('resize', () => this.resize());
  }
  
  bindToolbarEvents() {
    // 工具按钮
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTool(btn.dataset.tool);
      });
    });
    
    // 颜色选择器
    const strokeColorPicker = document.getElementById('strokeColorPicker');
    if (strokeColorPicker) {
      strokeColorPicker.addEventListener('change', (e) => {
        this.setStrokeColor(e.target.value);
      });
    }
    
    const fillColorPicker = document.getElementById('fillColorPicker');
    if (fillColorPicker) {
      fillColorPicker.addEventListener('change', (e) => {
        this.setFillColor(e.target.value);
      });
    }
    
    // 线条粗细
    const strokeWidthSelect = document.getElementById('strokeWidthSelect');
    if (strokeWidthSelect) {
      strokeWidthSelect.addEventListener('change', (e) => {
        this.setStrokeWidth(parseInt(e.target.value));
      });
    }
  }
  
  resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height - 60; // 减去工具栏高度
    this.render();
  }
  
  bindEvents() {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onPointerUp(e));
    
    // 触摸事件
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.onPointerDown(touch);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.onPointerMove(touch);
    });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onPointerUp(e);
    });
    
    // 键盘事件
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelected();
      }
    });
  }
  
  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }
  
  onPointerDown(e) {
    const pos = this.getPointerPos(e);
    this.startX = pos.x;
    this.startY = pos.y;
    
    if (this.currentTool === 'select') {
      this.selectedElement = this.getElementAt(pos.x, pos.y);
      if (this.selectedElement) {
        this.offsetX = pos.x - this.selectedElement.x;
        this.offsetY = pos.y - this.selectedElement.y;
        this.isDrawing = true;
      }
    } else if (this.currentTool !== 'text') {
      this.isDrawing = true;
      this.createElement(pos.x, pos.y);
    } else {
      this.createText(pos.x, pos.y);
    }
  }
  
  onPointerMove(e) {
    if (!this.isDrawing) return;
    
    const pos = this.getPointerPos(e);
    
    if (this.currentTool === 'select' && this.selectedElement) {
      this.selectedElement.x = pos.x - this.offsetX;
      this.selectedElement.y = pos.y - this.offsetY;
      this.render();
    } else if (this.currentTool !== 'select' && this.currentTool !== 'text') {
      this.updateElement(pos.x, pos.y);
      this.render();
    }
  }
  
  onPointerUp(e) {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.save();
    }
  }
  
  createElement(x, y) {
    const element = {
      id: Date.now(),
      type: this.currentTool,
      x: x,
      y: y,
      width: 0,
      height: 0,
      strokeColor: this.strokeColor,
      fillColor: this.fillColor,
      strokeWidth: this.strokeWidth
    };
    this.elements.push(element);
    this.selectedElement = element;
  }
  
  updateElement(x, y) {
    if (!this.selectedElement) return;
    
    this.selectedElement.width = x - this.startX;
    this.selectedElement.height = y - this.startY;
  }
  
  createText(x, y) {
    const text = prompt('输入文本：');
    if (text) {
      const element = {
        id: Date.now(),
        type: 'text',
        x: x,
        y: y,
        text: text,
        fontSize: 20,
        color: this.strokeColor
      };
      this.elements.push(element);
      this.save();
      this.render();
    }
  }
  
  getElementAt(x, y) {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (this.isPointInElement(x, y, el)) {
        return el;
      }
    }
    return null;
  }
  
  isPointInElement(x, y, el) {
    if (el.type === 'text') {
      const width = el.text.length * el.fontSize * 0.6;
      const height = el.fontSize;
      return x >= el.x && x <= el.x + width && y >= el.y - height && y <= el.y;
    }
    
    const minX = Math.min(el.x, el.x + el.width);
    const maxX = Math.max(el.x, el.x + el.width);
    const minY = Math.min(el.y, el.y + el.height);
    const maxY = Math.max(el.y, el.y + el.height);
    
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }
  
  deleteSelected() {
    if (this.selectedElement) {
      this.elements = this.elements.filter(el => el.id !== this.selectedElement.id);
      this.selectedElement = null;
      this.save();
      this.render();
    }
  }
  
  render() {
    if (!this.rc) return;
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 绘制网格背景
    this.drawGrid();
    
    // 绘制所有元素
    this.elements.forEach(el => {
      this.drawElement(el);
    });
    
    // 绘制选中框
    if (this.selectedElement) {
      this.drawSelection(this.selectedElement);
    }
  }
  
  drawGrid() {
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 0.5;
    
    const gridSize = 20;
    for (let x = 0; x < this.canvas.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }
  
  drawElement(el) {
    const options = {
      stroke: el.strokeColor,
      fill: el.fillColor !== 'transparent' ? el.fillColor : undefined,
      strokeWidth: el.strokeWidth,
      roughness: 1.5, // 手绘风格
      bowing: 1
    };
    
    if (el.type === 'rectangle') {
      this.rc.rectangle(el.x, el.y, el.width, el.height, options);
    } else if (el.type === 'circle') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rx = Math.abs(el.width) / 2;
      const ry = Math.abs(el.height) / 2;
      this.rc.ellipse(cx, cy, rx * 2, ry * 2, options);
    } else if (el.type === 'arrow') {
      const x1 = el.x;
      const y1 = el.y;
      const x2 = el.x + el.width;
      const y2 = el.y + el.height;
      this.rc.line(x1, y1, x2, y2, options);
      
      // 绘制箭头
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const arrowSize = 15;
      const arrowAngle = Math.PI / 6;
      
      this.rc.line(x2, y2, 
        x2 - arrowSize * Math.cos(angle - arrowAngle),
        y2 - arrowSize * Math.sin(angle - arrowAngle), options);
      this.rc.line(x2, y2,
        x2 - arrowSize * Math.cos(angle + arrowAngle),
        y2 - arrowSize * Math.sin(angle + arrowAngle), options);
    } else if (el.type === 'text') {
      this.ctx.font = `${el.fontSize}px "KaiTi", "STKaiti", serif`;
      this.ctx.fillStyle = el.color;
      this.ctx.fillText(el.text, el.x, el.y);
    }
  }
  
  drawSelection(el) {
    this.ctx.strokeStyle = '#4a90e2';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 5]);
    
    if (el.type === 'text') {
      const width = el.text.length * el.fontSize * 0.6;
      const height = el.fontSize;
      this.ctx.strokeRect(el.x - 5, el.y - height - 5, width + 10, height + 10);
    } else {
      const minX = Math.min(el.x, el.x + el.width) - 5;
      const maxX = Math.max(el.x, el.x + el.width) + 5;
      const minY = Math.min(el.y, el.y + el.height) - 5;
      const maxY = Math.max(el.y, el.y + el.height) + 5;
      this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }
    
    this.ctx.setLineDash([]);
  }
  
  setTool(tool) {
    this.currentTool = tool;
    this.selectedElement = null;
    this.render();
  }
  
  setStrokeColor(color) {
    this.strokeColor = color;
  }
  
  setFillColor(color) {
    this.fillColor = color;
  }
  
  setStrokeWidth(width) {
    this.strokeWidth = width;
  }
  
  clear() {
    if (confirm('确定要清空画布吗？')) {
      this.elements = [];
      this.selectedElement = null;
      this.save();
      this.render();
    }
  }
  
  save() {
    const data = {
      elements: this.elements,
      timestamp: Date.now()
    };
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }
  
  load() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.elements = data.elements || [];
      } catch (e) {
        console.error('加载绘图数据失败:', e);
        this.elements = [];
      }
    }
  }
  
  export() {
    const data = JSON.stringify(this.elements, null, 2);
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
        this.elements = data;
        this.save();
        this.render();
      } catch (err) {
        alert('导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
  }
}

// 全局实例
let drawingApp = null;

// 初始化
function initDrawing() {
  if (!drawingApp) {
    drawingApp = new DrawingApp('drawingCanvas', 'drawingView');
  }
}

// 工具切换
function setDrawingTool(tool) {
  if (drawingApp) {
    drawingApp.setTool(tool);
    // 更新 UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
  }
}

// 清空画布
function clearDrawing() {
  if (drawingApp) {
    drawingApp.clear();
  }
}

// 导出
function exportDrawing() {
  if (drawingApp) {
    drawingApp.export();
  }
}

// 导入
function importDrawing() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    if (drawingApp && e.target.files[0]) {
      drawingApp.import(e.target.files[0]);
    }
  };
  input.click();
}
