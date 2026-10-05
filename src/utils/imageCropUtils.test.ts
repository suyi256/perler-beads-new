import { describe, it, expect } from 'vitest';
import { cropToContent } from './imageCropUtils';
import { RawImageData } from './pixelation';

// 构造纯色测试图：'.' 表示背景色，其他字符为内容色
function makeImage(rows: string[]): RawImageData {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  const colors: Record<string, [number, number, number]> = {
    '.': [255, 255, 255],
    A: [229, 57, 53],
    B: [30, 136, 229]
  };
  rows.forEach((row, y) => {
    row.split('').forEach((ch, x) => {
      const [r, g, b] = colors[ch] ?? [0, 0, 0];
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    });
  });
  return { width, height, data };
}

describe('cropToContent', () => {
  it('裁掉四周的空白背景，保留内容包围盒', () => {
    const img = makeImage([
      '..........',
      '..........',
      '..AAA.....',
      '..AAA.....',
      '..........'
    ]);
    const result = cropToContent(img)!;
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(result.imageData.data[0]).toBe(229); // 左上角应为内容色 A
  });

  it('四角颜色各异（无主导背景，内容撑满）时返回 null', () => {
    const width = 2;
    const height = 2;
    const data = new Uint8ClampedArray(width * height * 4);
    const corners: [number, number, number][] = [
      [229, 57, 53],   // 红
      [30, 136, 229],  // 蓝
      [255, 221, 0],   // 黄
      [0, 170, 0]      // 绿
    ];
    corners.forEach(([r, g, b], i) => {
      const idx = i * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    });
    expect(cropToContent({ width, height, data })).toBeNull();
  });

  it('整张图都是背景时返回 null', () => {
    const img = makeImage([
      '...',
      '...'
    ]);
    expect(cropToContent(img)).toBeNull();
  });

  it('透明背景按透明判定内容', () => {
    // 用透明构造：边缘全为 '.'(白) 但中间有一个离群点触发宽包围盒的场景不适用；
    // 这里直接验证带 alpha 的数据
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // 全部透明背景
    for (let i = 0; i < width * height; i++) data[i * 4 + 3] = 0;
    // (2,2) 放一个不透明内容像素
    const idx = (2 * width + 2) * 4;
    data[idx] = 200;
    data[idx + 1] = 50;
    data[idx + 2] = 50;
    data[idx + 3] = 255;
    const result = cropToContent({ width, height, data })!;
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('容差内的背景噪声不会扩大包围盒', () => {
    const width = 6;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      // 背景白色，带 ±10 的噪声
      const noise = (i % 3) * 5;
      data[i * 4] = 255 - noise;
      data[i * 4 + 1] = 255 - noise;
      data[i * 4 + 2] = 255 - noise;
      data[i * 4 + 3] = 255;
    }
    // 中间放一个红色像素
    const idx = (1 * width + 2) * 4;
    data[idx] = 229;
    data[idx + 1] = 57;
    data[idx + 2] = 53;
    const result = cropToContent({ width, height, data })!;
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });
});
