import * as fabric from 'fabric';

export interface CanvasOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

export interface HistoryState {
  canvasState: string;
  timestamp: number;
}

export class CanvasManager {
  private canvas: fabric.Canvas | null = null;
  private history: HistoryState[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 50;
  private isRedoing: boolean = false;

  constructor(canvasElement: HTMLCanvasElement, options: CanvasOptions = {}) {
    this.canvas = new fabric.Canvas(canvasElement, {
      width: options.width || 1920,
      height: options.height || 1080,
      backgroundColor: options.backgroundColor || '#ffffff',
      preserveObjectStacking: true,
    });

    this.setupEventHandlers();
    this.saveState();
  }

  private setupEventHandlers() {
    if (!this.canvas) return;

    // 监听对象修改事件
    this.canvas.on('object:modified', () => {
      if (!this.isRedoing) {
        this.saveState();
      }
    });

    this.canvas.on('object:added', () => {
      if (!this.isRedoing) {
        this.saveState();
      }
    });

    this.canvas.on('object:removed', () => {
      if (!this.isRedoing) {
        this.saveState();
      }
    });
  }

  // 保存历史状态
  private saveState() {
    if (!this.canvas) return;

    const canvasState = JSON.stringify(this.canvas.toJSON());

    // 移除当前位置之后的历史
    this.history = this.history.slice(0, this.historyIndex + 1);

    // 添加新状态
    this.history.push({
      canvasState,
      timestamp: Date.now(),
    });

    // 限制历史大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  // 撤销
  undo() {
    if (!this.canvas || this.historyIndex <= 0) return;

    this.historyIndex--;
    this.loadState(this.history[this.historyIndex].canvasState);
  }

  // 重做
  redo() {
    if (!this.canvas || this.historyIndex >= this.history.length - 1) return;

    this.historyIndex++;
    this.loadState(this.history[this.historyIndex].canvasState);
  }

  // 加载状态
  private async loadState(state: string) {
    if (!this.canvas) return;

    this.isRedoing = true;
    try {
      await this.canvas.loadFromJSON(state);
      this.canvas.renderAll();
    } finally {
      this.isRedoing = false;
    }
  }

  // 判断是否可以撤销/重做
  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  // 添加图片
  async addImage(url: string, options?: Partial<fabric.FabricImage>) {
    if (!this.canvas) return;

    const img = await fabric.FabricImage.fromURL(url);
    img.set({
      left: 100,
      top: 100,
      ...options,
    });
    this.canvas.add(img);
    this.canvas.setActiveObject(img);
    this.canvas.renderAll();
  }

  // 添加文字
  addText(text: string = '双击编辑文字', options?: Partial<fabric.IText>) {
    if (!this.canvas) return;

    const textObj = new fabric.IText(text, {
      left: 100,
      top: 100,
      fontSize: 32,
      fill: '#000000',
      fontFamily: 'Arial',
      ...options,
    });

    this.canvas.add(textObj);
    this.canvas.setActiveObject(textObj);
    this.canvas.renderAll();
  }

  // 添加矩形
  addRect(options?: Partial<fabric.Rect>) {
    if (!this.canvas) return;

    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      width: 200,
      height: 150,
      fill: '#3b82f6',
      stroke: '#1e40af',
      strokeWidth: 2,
      ...options,
    });

    this.canvas.add(rect);
    this.canvas.setActiveObject(rect);
    this.canvas.renderAll();
  }

  // 添加圆形
  addCircle(options?: Partial<fabric.Circle>) {
    if (!this.canvas) return;

    const circle = new fabric.Circle({
      left: 100,
      top: 100,
      radius: 75,
      fill: '#10b981',
      stroke: '#047857',
      strokeWidth: 2,
      ...options,
    });

    this.canvas.add(circle);
    this.canvas.setActiveObject(circle);
    this.canvas.renderAll();
  }

  // 删除选中对象
  deleteSelected() {
    if (!this.canvas) return;

    const activeObjects = this.canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      activeObjects.forEach((obj) => {
        this.canvas?.remove(obj);
      });
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
    }
  }

  // 复制选中对象
  async copySelected() {
    if (!this.canvas) return;

    const activeObject = this.canvas.getActiveObject();
    if (!activeObject) return;

    const cloned = await activeObject.clone();

    cloned.set({
      left: (cloned.left || 0) + 20,
      top: (cloned.top || 0) + 20,
    });

    this.canvas.add(cloned);
    this.canvas.setActiveObject(cloned);
    this.canvas.renderAll();
  }

  // 清空画布
  clear() {
    if (!this.canvas) return;

    this.canvas.clear();
    this.canvas.backgroundColor = '#ffffff';
    this.canvas.renderAll();
    this.saveState();
  }

  // 导出为图片
  exportToImage(format: 'png' | 'jpeg' = 'png', quality: number = 1.0): string {
    if (!this.canvas) return '';

    return this.canvas.toDataURL({
      format,
      quality,
      multiplier: 1,
    });
  }

  // 导出为 JSON
  exportToJSON(): string {
    if (!this.canvas) return '';

    return JSON.stringify(this.canvas.toJSON());
  }

  // 从 JSON 导入
  async importFromJSON(json: string) {
    if (!this.canvas) return;

    await this.canvas.loadFromJSON(json);
    this.canvas.renderAll();
    this.saveState();
  }

  // 获取所有对象
  getObjects(): fabric.Object[] {
    if (!this.canvas) return [];
    return this.canvas.getObjects();
  }

  // 获取选中对象
  getActiveObject(): fabric.Object | null {
    if (!this.canvas) return null;
    return this.canvas.getActiveObject() || null;
  }

  // 设置选中对象
  setActiveObject(obj: fabric.Object) {
    if (!this.canvas) return;
    this.canvas.setActiveObject(obj);
    this.canvas.renderAll();
  }

  // 取消选中
  discardActiveObject() {
    if (!this.canvas) return;
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  // 移动对象到指定层级
  moveObjectToLayer(obj: fabric.Object, direction: 'front' | 'back' | 'forward' | 'backward') {
    if (!this.canvas) return;

    switch (direction) {
      case 'front':
        this.canvas.bringObjectToFront(obj);
        break;
      case 'back':
        this.canvas.sendObjectToBack(obj);
        break;
      case 'forward':
        this.canvas.bringObjectForward(obj);
        break;
      case 'backward':
        this.canvas.sendObjectBackwards(obj);
        break;
    }

    this.canvas.renderAll();
  }

  // 销毁画布
  dispose() {
    if (this.canvas) {
      this.canvas.dispose();
      this.canvas = null;
    }
    this.history = [];
    this.historyIndex = -1;
  }

  // 获取原始 Fabric.js Canvas 对象
  getCanvas(): fabric.Canvas | null {
    return this.canvas;
  }
}
