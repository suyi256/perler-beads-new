import { RawImageData } from './pixelation';

export interface ContentCropResult {
  imageData: RawImageData;
  width: number;
  height: number;
}

const BG_COLOR_TOLERANCE = 16; // 每通道容差，容忍 JPEG 压缩噪声与轻微抗锯齿

/**
 * 自动裁剪空白边缘：找出主体内容的包围盒并裁剪，
 * 使同一网格粒度下主体获得更高的有效分辨率。
 * 主体已撑满画面、纯空白图或找不到可裁空间时返回 null（保持原样）。
 */
export function cropToContent(imageData: RawImageData): ContentCropResult | null {
  const { width, height, data } = imageData;
  if (width === 0 || height === 0) return null;

  // 1. 背景色 = 图片边缘像素中出现频率最高的量化色；边缘存在透明像素时以透明为背景
  let borderTransparent = false;
  const borderCounts = new Map<string, { count: number; r: number; g: number; b: number }>();
  const bumpBorder = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 128) {
      borderTransparent = true;
      return;
    }
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = borderCounts.get(key);
    if (entry) {
      entry.count++;
    } else {
      borderCounts.set(key, { count: 1, r, g, b });
    }
  };
  for (let x = 0; x < width; x++) {
    bumpBorder(x, 0);
    bumpBorder(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    bumpBorder(0, y);
    bumpBorder(width - 1, y);
  }

  let bg: { r: number; g: number; b: number } | null = null;
  if (!borderTransparent && borderCounts.size > 0) {
    let best: { count: number; r: number; g: number; b: number } | null = null;
    for (const entry of borderCounts.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    if (best) bg = { r: best.r, g: best.g, b: best.b };
  }

  const isBackground = (idx: number): boolean => {
    if (data[idx + 3] < 128) return bg === null; // 无透明背景时透明像素视作内容
    if (!bg) return false;
    return (
      Math.abs(data[idx] - bg.r) <= BG_COLOR_TOLERANCE &&
      Math.abs(data[idx + 1] - bg.g) <= BG_COLOR_TOLERANCE &&
      Math.abs(data[idx + 2] - bg.b) <= BG_COLOR_TOLERANCE
    );
  };

  // 2. 扫描内容包围盒
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isBackground((y * width + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null; // 整张图都是背景
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  if (boxWidth === width && boxHeight === height) return null; // 已撑满，无需裁剪

  // 3. 提取裁剪区域
  const out = new Uint8ClampedArray(boxWidth * boxHeight * 4);
  for (let y = 0; y < boxHeight; y++) {
    const srcRow = ((minY + y) * width + minX) * 4;
    out.set(data.subarray(srcRow, srcRow + boxWidth * 4), y * boxWidth * 4);
  }

  return {
    imageData: { width: boxWidth, height: boxHeight, data: out },
    width: boxWidth,
    height: boxHeight
  };
}
