import { WorkflowNode, ExecutionContext, NodeConfigSchema } from './base';

function loadImage(value: unknown): Promise<HTMLImageElement> {
  if (typeof value !== 'string' || (!/^data:image\//i.test(value) && !/^https:\/\//i.test(value))) {
    return Promise.reject(new Error('图片输入必须是 data URL 或 HTTPS 地址'));
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = value;
  });
}

function renderImage(image: HTMLImageElement, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持 Canvas 图片处理');
  draw(context);
  return canvas.toDataURL('image/png');
}

export class CropNode extends WorkflowNode {
  type = 'crop' as const; name = '裁剪'; description = '裁剪图片'; inputs = ['image']; outputs = ['image']; portTypes = { image: 'image' as const };
  async validate(context: ExecutionContext) { return !!context.inputs.image; }
  async execute(context: ExecutionContext) {
    const image = await loadImage(context.inputs.image); const { x = 0, y = 0, width, height } = context.config;
    if (!width || !height) throw new Error('裁剪宽度和高度必须大于 0');
    return renderImage(image, width, height, (ctx) => ctx.drawImage(image, -x, -y));
  }
  getConfigSchema(): NodeConfigSchema { return { x: { type: 'integer', label: 'X', default: 0, min: 0 }, y: { type: 'integer', label: 'Y', default: 0, min: 0 }, width: { type: 'integer', label: '宽度', default: 100, min: 1 }, height: { type: 'integer', label: '高度', default: 100, min: 1 } }; }
}

export class ResizeNode extends WorkflowNode {
  type = 'resize' as const; name = '缩放'; description = '调整图片尺寸'; inputs = ['image']; outputs = ['image']; portTypes = { image: 'image' as const };
  async validate(context: ExecutionContext) { return !!context.inputs.image; }
  async execute(context: ExecutionContext) {
    const image = await loadImage(context.inputs.image); const width = Number(context.config.width); const height = Number(context.config.height);
    if (!width || !height) throw new Error('缩放宽度和高度必须大于 0');
    const scale = context.config.maintainAspectRatio === false ? 1 : Math.min(width / image.width, height / image.height);
    const targetWidth = context.config.maintainAspectRatio === false ? width : Math.max(1, Math.round(image.width * scale));
    const targetHeight = context.config.maintainAspectRatio === false ? height : Math.max(1, Math.round(image.height * scale));
    return renderImage(image, targetWidth, targetHeight, (ctx) => ctx.drawImage(image, 0, 0, targetWidth, targetHeight));
  }
  getConfigSchema(): NodeConfigSchema { return { width: { type: 'integer', label: '宽度', default: 1024, min: 1, max: 8192 }, height: { type: 'integer', label: '高度', default: 1024, min: 1, max: 8192 }, maintainAspectRatio: { type: 'boolean', label: '保持比例', default: true } }; }
}

export class FilterNode extends WorkflowNode {
  type = 'filter' as const; name = '滤镜'; description = '应用图片滤镜'; inputs = ['image']; outputs = ['image']; portTypes = { image: 'image' as const };
  async validate(context: ExecutionContext) { return !!context.inputs.image; }
  async execute(context: ExecutionContext) {
    const image = await loadImage(context.inputs.image); const type = context.config.filterType ?? 'blur'; const intensity = Number(context.config.intensity ?? 0.5);
    return renderImage(image, image.width, image.height, (ctx) => {
      if (type === 'grayscale') ctx.filter = 'grayscale(1)';
      else if (type === 'sepia') ctx.filter = `sepia(${Math.min(1, intensity)})`;
      else if (type === 'blur') ctx.filter = `blur(${Math.max(1, intensity * 8)}px)`;
      else if (type === 'sharpen') ctx.filter = `contrast(${1 + intensity}) saturate(${1 + intensity})`;
      ctx.drawImage(image, 0, 0);
    });
  }
  getConfigSchema(): NodeConfigSchema { return { filterType: { type: 'combo', label: '滤镜类型', options: ['blur', 'sharpen', 'grayscale', 'sepia'], default: 'blur' }, intensity: { type: 'float', label: '强度', default: 0.5, min: 0, max: 1, step: 0.05 } }; }
}
