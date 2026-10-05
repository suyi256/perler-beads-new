import { describe, it, expect } from 'vitest';
import {
  getIslandAt,
  getDominantNeighborColor,
  absorbIsland,
  cleanupSmallIslands,
  smoothEdges
} from './spatialCleanup';
import { MappedPixel } from './pixelation';
import { TRANSPARENT_KEY, transparentColorData } from './pixelEditingUtils';

function cell(key: string, color: string): MappedPixel {
  return { key, color, isExternal: false };
}

function grid(rows: string[]): MappedPixel[][] {
  // 用字符矩阵快速构造网格：'.' 为透明，其他字符为同名颜色的格子
  return rows.map(row =>
    row.split('').map(ch => (ch === '.' ? { ...transparentColorData } : cell(ch, '#' + ch)))
  );
}

describe('getIslandAt', () => {
  it('收集 4 邻接的同色连通块', () => {
    const g = grid([
      'AAB',
      'AAB',
      'BBB'
    ]);
    const island = getIslandAt(g, 0, 0)!;
    expect(island.key).toBe('A');
    expect(island.cells).toHaveLength(4); // (0,0)(0,1)(1,0)(1,1)
  });

  it('对角线不算连通', () => {
    const g = grid([
      'A.',
      '.A'
    ]);
    expect(getIslandAt(g, 0, 0)!.cells).toHaveLength(1);
  });

  it('起点是透明/外部格子时返回 null', () => {
    const g = grid(['.A']);
    expect(getIslandAt(g, 0, 0)).toBeNull();
  });
});

describe('getDominantNeighborColor', () => {
  it('返回接触边最多的邻接颜色', () => {
    const g = grid([
      'BBB',
      'BAB',
      'CCC'
    ]);
    const island = getIslandAt(g, 1, 1)!;
    const target = getDominantNeighborColor(g, island)!;
    expect(target.key).toBe('B'); // B 接触 3 边，C 接触 1 边
  });

  it('周围只有透明区域时返回 null', () => {
    const g = grid([
      '...',
      '.A.',
      '...'
    ]);
    const island = getIslandAt(g, 1, 1)!;
    expect(getDominantNeighborColor(g, island)).toBeNull();
  });
});

describe('absorbIsland', () => {
  it('把整个连通块替换为目标颜色且不改入参', () => {
    const g = grid([
      'AAA',
      'ABA'
    ]);
    const island = getIslandAt(g, 0, 0)!; // 上方 5 格的 A 连通块
    expect(island.cells).toHaveLength(5);
    const next = absorbIsland(g, island, cell('B', '#B'));
    expect(next[0][0].key).toBe('B');
    expect(next[1][1].key).toBe('B');
    expect(g[0][0].key).toBe('A'); // 原网格未被修改
  });
});

describe('cleanupSmallIslands', () => {
  it('吸收面积小于阈值的孤立色块', () => {
    const g = grid([
      'BBBB',
      'BACB',
      'BBBB'
    ]);
    const next = cleanupSmallIslands(g, 2);
    expect(next[1][1].key).toBe('B');
    expect(next[1][2].key).toBe('B');
  });

  it('保留面积足够的色块', () => {
    const g = grid([
      'BBBB',
      'BAAB',
      'BAAB',
      'BBBB'
    ]);
    const next = cleanupSmallIslands(g, 2);
    expect(next[1][1].key).toBe('A');
    expect(next[2][2].key).toBe('A');
  });

  it('强度小于 1 时原样返回', () => {
    const g = grid(['BAB']);
    expect(cleanupSmallIslands(g, 0)).toBe(g);
    expect(cleanupSmallIslands(g, 1)).toBe(g);
  });

  it('被透明区域包围的孤岛保留不动', () => {
    const g = grid([
      '...',
      '.A.',
      '...'
    ]);
    const next = cleanupSmallIslands(g, 3);
    expect(next[1][1].key).toBe('A');
  });

  it('透明键本身不参与清理', () => {
    const g = grid(['.A.']);
    const next = cleanupSmallIslands(g, 5);
    expect(next[0][1].key).toBe('A');
    expect(next[0][0].key).toBe(TRANSPARENT_KEY);
  });
});

describe('smoothEdges', () => {
  it('翻转被强主色包围的杂色格', () => {
    const g = grid([
      'BBB',
      'BAB',
      'BBB'
    ]);
    const next = smoothEdges(g, 1);
    expect(next[1][1].key).toBe('B'); // 8 邻域全为 B
  });

  it('不翻转周围支持不足的格子（保留边界）', () => {
    const g = grid([
      'AAB',
      'AAB',
      'AAB'
    ]);
    const next = smoothEdges(g, 1);
    // (0,1) 的邻域：A×4（左、下左、下、下右），B×1（右）→ A 不足 5，B 更少，保持 B
    expect(next[0][2].key).toBe('B');
    expect(next[1][2].key).toBe('B');
  });

  it('不修改入参', () => {
    const g = grid([
      'BBB',
      'BAB',
      'BBB'
    ]);
    smoothEdges(g, 1);
    expect(g[1][1].key).toBe('A');
  });

  it('透明格子不参与也不被翻转', () => {
    const g = grid([
      'BBB',
      'B.B',
      'BBB'
    ]);
    const next = smoothEdges(g, 1);
    expect(next[1][1].key).toBe(TRANSPARENT_KEY);
  });
});
