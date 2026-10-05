import { MappedPixel } from './pixelation';
import { TRANSPARENT_KEY } from './pixelEditingUtils';

interface Point {
  row: number;
  col: number;
}

interface Island {
  cells: Point[];
  key: string;
}

// 可参与清理的单元格：非外部（含透明）、有有效色号
function isValidCell(cell: MappedPixel | undefined): boolean {
  return !!cell && !cell.isExternal && !!cell.key && cell.key !== TRANSPARENT_KEY;
}

/**
 * 获取包含 (row, col) 的同色连通区域（4 邻接，与拼豆物理相邻关系一致）
 */
export function getIslandAt(
  pixelData: MappedPixel[][],
  row: number,
  col: number
): Island | null {
  const M = pixelData.length;
  const N = M > 0 ? pixelData[0].length : 0;
  if (row < 0 || row >= M || col < 0 || col >= N) return null;

  const seed = pixelData[row][col];
  if (!isValidCell(seed)) return null;

  const targetKey = seed.key;
  const visited = new Set<number>();
  const cells: Point[] = [];
  const stack: Point[] = [{ row, col }];
  visited.add(row * N + col);

  while (stack.length > 0) {
    const { row: r, col: c } = stack.pop()!;
    cells.push({ row: r, col: c });

    const neighbors = [
      { row: r - 1, col: c },
      { row: r + 1, col: c },
      { row: r, col: c - 1 },
      { row: r, col: c + 1 }
    ];
    for (const n of neighbors) {
      if (n.row < 0 || n.row >= M || n.col < 0 || n.col >= N) continue;
      const idx = n.row * N + n.col;
      if (visited.has(idx)) continue;
      const cell = pixelData[n.row][n.col];
      if (!isValidCell(cell) || cell.key !== targetKey) continue;
      visited.add(idx);
      stack.push(n);
    }
  }

  return { cells, key: targetKey };
}

/**
 * 统计连通区域边界上各邻接颜色的接触边数，返回接触最多的颜色。
 * 透明/外部格子不作为吸收目标；周围没有可用颜色时返回 null。
 */
export function getDominantNeighborColor(
  pixelData: MappedPixel[][],
  island: Island
): MappedPixel | null {
  const M = pixelData.length;
  const N = M > 0 ? pixelData[0].length : 0;

  const islandSet = new Set(island.cells.map(c => c.row * N + c.col));
  const borderCounts = new Map<string, { count: number; colorData: MappedPixel }>();

  for (const { row, col } of island.cells) {
    const neighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 }
    ];
    for (const n of neighbors) {
      if (n.row < 0 || n.row >= M || n.col < 0 || n.col >= N) continue;
      const idx = n.row * N + n.col;
      if (islandSet.has(idx)) continue;
      const cell = pixelData[n.row][n.col];
      if (!isValidCell(cell)) continue;

      const entry = borderCounts.get(cell.key);
      if (entry) {
        entry.count++;
      } else {
        borderCounts.set(cell.key, {
          count: 1,
          colorData: { key: cell.key, color: cell.color, isExternal: false }
        });
      }
    }
  }

  if (borderCounts.size === 0) return null;

  let best: { count: number; colorData: MappedPixel } | null = null;
  for (const entry of borderCounts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? best.colorData : null;
}

/**
 * 将连通区域整体吸收为指定颜色（返回新网格，不修改入参）
 */
export function absorbIsland(
  pixelData: MappedPixel[][],
  island: Island,
  target: MappedPixel
): MappedPixel[][] {
  const newPixelData = pixelData.map(row => row.map(cell => ({ ...cell })));
  for (const { row, col } of island.cells) {
    newPixelData[row][col] = { ...target };
  }
  return newPixelData;
}

/**
 * 全局杂色清理：将面积小于 minIslandSize 的孤立同色连通块吸收到邻接主色。
 * minIslandSize <= 1 时视为关闭，原样返回。
 * 周围没有可吸收颜色（如被透明区域包围）的孤岛保留不动。
 */
export function cleanupSmallIslands(
  pixelData: MappedPixel[][],
  minIslandSize: number
): MappedPixel[][] {
  if (minIslandSize <= 1) return pixelData;

  const M = pixelData.length;
  const N = M > 0 ? pixelData[0].length : 0;
  if (M === 0 || N === 0) return pixelData;

  // 一次性标出所有连通块
  const visited = new Array(M).fill(null).map(() => new Array(N).fill(false));
  const islands: Island[] = [];
  for (let r = 0; r < M; r++) {
    for (let c = 0; c < N; c++) {
      if (visited[r][c]) continue;
      const cell = pixelData[r][c];
      if (!isValidCell(cell)) {
        visited[r][c] = true;
        continue;
      }
      // 从 (r, c) BFS 收集同色连通块
      const islandCells: Point[] = [];
      const stack: Point[] = [{ row: r, col: c }];
      visited[r][c] = true;
      while (stack.length > 0) {
        const { row, col } = stack.pop()!;
        islandCells.push({ row, col });
        const neighbors = [
          { row: row - 1, col },
          { row: row + 1, col },
          { row, col: col - 1 },
          { row, col: col + 1 }
        ];
        for (const n of neighbors) {
          if (n.row < 0 || n.row >= M || n.col < 0 || n.col >= N) continue;
          if (visited[n.row][n.col]) continue;
          const neighborCell = pixelData[n.row][n.col];
          if (!isValidCell(neighborCell) || neighborCell.key !== cell.key) continue;
          visited[n.row][n.col] = true;
          stack.push(n);
        }
      }
      islands.push({ cells: islandCells, key: cell.key });
    }
  }

  // 小块优先处理，让吸收目标尽量是已经干净的区域
  islands.sort((a, b) => a.cells.length - b.cells.length);

  const working = pixelData.map(row => row.map(cell => ({ ...cell })));
  let mergedCount = 0;
  for (const island of islands) {
    if (island.cells.length >= minIslandSize) continue;
    const target = getDominantNeighborColor(working, island);
    if (!target) continue;
    for (const { row, col } of island.cells) {
      working[row][col] = { ...target };
    }
    mergedCount++;
  }

  console.log(`杂色清理：共吸收 ${mergedCount} 个面积小于 ${minIslandSize} 的孤立色块`);
  return working;
}
