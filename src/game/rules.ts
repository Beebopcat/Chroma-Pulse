import {
  ActivePiece,
  BlockColor,
  CellMatrix2x2,
  GridCell,
  SkinTheme,
  SquareMatch,
} from './types';
import { BUILTIN_SKINS } from './skins';

export const GRID_COLS = 16;
export const GRID_ROWS = 10;
export const SPAWN_COL = 7;
export const SPAWN_ROW = -2;

export type BoardGrid = (GridCell | null)[][];

/**
 * Creates an empty 16x10 Lumines board grid indexed as board[row][col].
 */
export function createEmptyBoard(rows = GRID_ROWS, cols = GRID_COLS): BoardGrid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

/**
 * Clones a board deeply so pure functions never mutate state in place unexpectedly.
 */
export function cloneBoard(board: BoardGrid): BoardGrid {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

/**
 * Creates a deterministic or random 2x2 CellMatrix2x2.
 */
export function createPieceCells(
  rng: () => number = Math.random,
  allowSpecial = true
): CellMatrix2x2 {
  const randomColor = (): BlockColor => (rng() < 0.5 ? 1 : 2);
  const c00 = randomColor();
  const c01 = randomColor();
  const c10 = randomColor();
  const c11 = randomColor();

  // ~7% chance of spawning one special chain gem block in the 2x2 piece
  const hasSpecial = allowSpecial && rng() < 0.07;
  const specialIdx = hasSpecial ? Math.floor(rng() * 4) : -1;

  return [
    [
      { color: c00, isSpecial: specialIdx === 0 },
      { color: c01, isSpecial: specialIdx === 1 },
    ],
    [
      { color: c10, isSpecial: specialIdx === 2 },
      { color: c11, isSpecial: specialIdx === 3 },
    ],
  ];
}

/**
 * Spawns a new ActivePiece at the top center staging area.
 */
export function createActivePiece(cells: CellMatrix2x2): ActivePiece {
  return {
    col: SPAWN_COL,
    row: SPAWN_ROW,
    fallProgress: 0,
    cells: [
      [{ ...cells[0][0] }, { ...cells[0][1] }],
      [{ ...cells[1][0] }, { ...cells[1][1] }],
    ],
    visualRotation: 0,
  };
}

/**
 * Rotates a 2x2 cell matrix clockwise:
 * [A, B] -> [C, A]
 * [C, D]    [D, B]
 */
export function rotateCellsCW(cells: CellMatrix2x2): CellMatrix2x2 {
  return [
    [{ ...cells[1][0] }, { ...cells[0][0] }],
    [{ ...cells[1][1] }, { ...cells[0][1] }],
  ];
}

/**
 * Rotates a 2x2 cell matrix counter-clockwise:
 * [A, B] -> [B, D]
 * [C, D]    [A, C]
 */
export function rotateCellsCCW(cells: CellMatrix2x2): CellMatrix2x2 {
  return [
    [{ ...cells[0][1] }, { ...cells[1][1] }],
    [{ ...cells[0][0] }, { ...cells[1][0] }],
  ];
}

/**
 * Checks if an ActivePiece can occupy (targetCol, targetRow) without colliding with settled blocks or walls.
 */
export function canPieceOccupy(
  board: BoardGrid,
  targetCol: number,
  targetRow: number
): boolean {
  if (targetCol < 0 || targetCol + 1 >= GRID_COLS) {
    return false;
  }
  if (targetRow + 1 >= GRID_ROWS) {
    return false;
  }

  for (let rOff = 0; rOff < 2; rOff++) {
    for (let cOff = 0; cOff < 2; cOff++) {
      const r = targetRow + rOff;
      const c = targetCol + cOff;
      if (r >= 0) {
        if (r >= GRID_ROWS || board[r][c] !== null) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Applies Lumines split-column gravity to the entire board:
 * any unsupported cell falls straight down to fill empty spaces below it.
 * Returns the new board and whether any cell moved.
 */
export function applyGravity(board: BoardGrid): { board: BoardGrid; moved: boolean } {
  const next = createEmptyBoard(board.length, board[0].length);
  let moved = false;
  const rows = board.length;
  const cols = board[0].length;

  for (let c = 0; c < cols; c++) {
    let writeRow = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const cell = board[r][c];
      if (cell !== null) {
        if (writeRow !== r) {
          moved = true;
        }
        next[writeRow][c] = { ...cell };
        writeRow--;
      }
    }
  }

  return { board: next, moved };
}

/**
 * Locks an ActivePiece into the board using authentic Lumines split-column drop physics:
 * Each of the two columns of the 2x2 piece drops independently onto the highest occupied cell in that column.
 * If a cell lands above row 0 (overflows the 10-row playfield), `overflowed` is set to true (Game Over).
 */
export function lockPieceSplitGravity(
  board: BoardGrid,
  piece: ActivePiece
): {
  board: BoardGrid;
  overflowed: boolean;
  placedPositions: { row: number; col: number; cell: GridCell }[];
} {
  const next = cloneBoard(board);
  let overflowed = false;
  const placedPositions: { row: number; col: number; cell: GridCell }[] = [];

  for (let cOff = 0; cOff < 2; cOff++) {
    const col = piece.col + cOff;
    if (col < 0 || col >= GRID_COLS) continue;

    // Find the lowest empty row in this column
    let landingRow = GRID_ROWS - 1;
    while (landingRow >= 0 && next[landingRow][col] !== null) {
      landingRow--;
    }

    // Bottom cell of this column in the 2x2 piece (rOff = 1), then top cell (rOff = 0)
    for (let rOff = 1; rOff >= 0; rOff--) {
      const cell = { ...piece.cells[rOff][cOff], isMatched: false, isSwept: false };
      if (landingRow < 0) {
        overflowed = true;
      } else {
        next[landingRow][col] = cell;
        placedPositions.push({ row: landingRow, col, cell });
        landingRow--;
      }
    }
  }

  return { board: next, overflowed, placedPositions };
}

/**
 * Scans the board for all 2x2 same-color squares and marks participating cells with `isMatched = true`.
 * Also expands any matched square containing a special Chain Gem (`isSpecial = true`) to all
 * orthogonally connected cells of the same color.
 * Preserves existing `isSwept` flags on cells that remain matched.
 */
export function detectSquares(
  board: BoardGrid,
  existingSweepCol = -1
): {
  board: BoardGrid;
  squares: SquareMatch[];
  matchedCellCount: number;
} {
  const next = cloneBoard(board);
  const rows = next.length;
  const cols = next[0].length;

  // Reset match flags first, keeping track of previously swept state
  const wasSwept: boolean[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (__, c) => Boolean(next[r][c]?.isSwept))
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (next[r][c]) {
        next[r][c]!.isMatched = false;
        next[r][c]!.isSwept = false;
      }
    }
  }

  const squares: SquareMatch[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = next[r][c];
      const b = next[r][c + 1];
      const d = next[r + 1][c];
      const e = next[r + 1][c + 1];

      if (a && b && d && e && a.color === b.color && a.color === d.color && a.color === e.color) {
        a.isMatched = true;
        b.isMatched = true;
        d.isMatched = true;
        e.isMatched = true;

        const swept =
          (wasSwept[r][c] && wasSwept[r][c + 1] && wasSwept[r + 1][c] && wasSwept[r + 1][c + 1]) ||
          (existingSweepCol >= c + 1 && wasSwept[r][c]);

        if (swept) {
          a.isSwept = true;
          b.isSwept = true;
          d.isSwept = true;
          e.isSwept = true;
        }

        squares.push({
          col: c,
          row: r,
          color: a.color,
          swept,
        });
      }
    }
  }

  // Chain Gem BFS: if any matched cell has isSpecial === true, flood-fill orthogonal neighbors of same color
  const queue: [number, number, BlockColor][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = next[r][c];
      if (cell && cell.isMatched && cell.isSpecial) {
        queue.push([r, c, cell.color]);
      }
    }
  }

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  while (queue.length > 0) {
    const [cr, cc, color] = queue.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const neighbor = next[nr][nc];
        if (neighbor && neighbor.color === color && !neighbor.isMatched) {
          neighbor.isMatched = true;
          if (wasSwept[nr][nc]) {
            neighbor.isSwept = true;
          }
          queue.push([nr, nc, color]);
        }
      }
    }
  }

  let matchedCellCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (next[r][c]?.isMatched) {
        matchedCellCount++;
      }
    }
  }

  return { board: next, squares, matchedCellCount };
}

/**
 * Advances the Timeline Bar across columns [prevColFloat -> nextColFloat] (in range 0..GRID_COLS).
 * Marks any fully-crossed 2x2 squares (where c + 2 <= currentSweepCol) as `isSwept = true`,
 * and when the Timeline Bar passes an isolated cluster or wraps around at column 16,
 * clears all swept cells, applies gravity, and calculates score & bonuses.
 */
export interface ClearedCellInfo {
  row: number;
  col: number;
  color: BlockColor;
  isSpecial: boolean;
}

export function stepTimelineSweep(
  board: BoardGrid,
  prevColFloat: number,
  nextColFloat: number,
  currentCombo: number
): {
  board: BoardGrid;
  squares: SquareMatch[];
  newlySweptSquares: number;
  clearedSquaresThisStep: number;
  clearedCellsCount: number;
  clearedCells: ClearedCellInfo[];
  clearedRowIndices: number[];
  scoreDelta: number;
  nextCombo: number;
  allClearBonus: boolean;
  uniColorBonus: boolean;
  wrappedAround: boolean;
} {
  let workingBoard = cloneBoard(board);
  const wrappedAround = nextColFloat < prevColFloat;
  const effectiveCol = wrappedAround ? GRID_COLS : Math.floor(nextColFloat);

  // First detect all active squares
  let detection = detectSquares(workingBoard);
  workingBoard = detection.board;
  let squares = detection.squares;

  let newlySweptSquares = 0;

  // Any square whose right edge (sq.col + 2) is <= effectiveCol gets swept by the timeline
  for (const sq of squares) {
    if (sq.col + 2 <= effectiveCol) {
      const c00 = workingBoard[sq.row][sq.col];
      const c01 = workingBoard[sq.row][sq.col + 1];
      const c10 = workingBoard[sq.row + 1][sq.col];
      const c11 = workingBoard[sq.row + 1][sq.col + 1];

      const alreadySwept = Boolean(c00?.isSwept && c01?.isSwept && c10?.isSwept && c11?.isSwept);
      if (!alreadySwept) {
        newlySweptSquares++;
      }
      if (c00) c00.isSwept = true;
      if (c01) c01.isSwept = true;
      if (c10) c10.isSwept = true;
      if (c11) c11.isSwept = true;
      sq.swept = true;
    }
  }

  // Also mark any chained matched cells whose column + 1 <= effectiveCol as swept
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < Math.min(GRID_COLS, effectiveCol); c++) {
      const cell = workingBoard[r][c];
      if (cell?.isMatched) {
        cell.isSwept = true;
      }
    }
  }

  // Check if we should commit an erase pass:
  // Either the timeline wrapped around at the right edge (column 16 -> 0),
  // OR there are swept cells behind the bar and the column immediately under the bar has NO matched cells
  // (classic Lumines cluster release behavior!).
  let hasSweptCells = false;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (workingBoard[r][c]?.isSwept) {
        hasSweptCells = true;
        break;
      }
    }
    if (hasSweptCells) break;
  }

  let activeColumnHasMatch = false;
  if (!wrappedAround && effectiveCol > 0 && effectiveCol <= GRID_COLS) {
    const checkCol = Math.min(GRID_COLS - 1, effectiveCol - 1);
    for (let r = 0; r < GRID_ROWS; r++) {
      if (workingBoard[r][checkCol]?.isMatched) {
        activeColumnHasMatch = true;
        break;
      }
    }
  }

  let clearedSquaresThisStep = 0;
  let clearedCellsCount = 0;
  const clearedCells: ClearedCellInfo[] = [];
  const clearedRowSet = new Set<number>();
  let scoreDelta = 0;
  let nextCombo = currentCombo;
  let allClearBonus = false;
  let uniColorBonus = false;

  if (hasSweptCells && (wrappedAround || !activeColumnHasMatch)) {
    // Count how many swept 2x2 squares are being erased
    const sweptSquareCount = squares.filter((sq) => sq.swept).length;
    clearedSquaresThisStep = Math.max(1, sweptSquareCount);

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = workingBoard[r][c];
        if (cell?.isSwept) {
          clearedCells.push({
            row: r,
            col: c,
            color: cell.color,
            isSpecial: Boolean(cell.isSpecial),
          });
          clearedRowSet.add(r);
          workingBoard[r][c] = null;
          clearedCellsCount++;
        }
      }
    }

    // Apply gravity so upper blocks fall into cleared space
    const grav = applyGravity(workingBoard);
    workingBoard = grav.board;

    // Re-detect newly formed 2x2 squares from the cascade
    detection = detectSquares(workingBoard);
    workingBoard = detection.board;
    squares = detection.squares;

    // Update combo & score
    if (clearedSquaresThisStep >= 1) {
      nextCombo = wrappedAround && clearedSquaresThisStep < 2 ? 1 : currentCombo + 1;
    }

    // Check remaining blocks for All Clear or Uni-Color bonus
    let remainingTotal = 0;
    let hasColor1 = false;
    let hasColor2 = false;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = workingBoard[r][c];
        if (cell) {
          remainingTotal++;
          if (cell.color === 1) hasColor1 = true;
          if (cell.color === 2) hasColor2 = true;
        }
      }
    }

    if (remainingTotal === 0) {
      allClearBonus = true;
    } else if (remainingTotal >= 4 && (hasColor1 !== hasColor2)) {
      uniColorBonus = true;
    }

    scoreDelta = calculateSweepScore(
      clearedSquaresThisStep,
      clearedCellsCount,
      nextCombo,
      allClearBonus,
      uniColorBonus
    );
  } else if (wrappedAround && !hasSweptCells) {
    nextCombo = 0;
  }

  return {
    board: workingBoard,
    squares,
    newlySweptSquares,
    clearedSquaresThisStep,
    clearedCellsCount,
    clearedCells,
    clearedRowIndices: Array.from(clearedRowSet).sort((a, b) => a - b),
    scoreDelta,
    nextCombo,
    allClearBonus,
    uniColorBonus,
    wrappedAround,
  };
}

/**
 * Calculates the score awarded for a timeline sweep clear.
 */
export function calculateSweepScore(
  clearedSquares: number,
  clearedCells: number,
  comboMultiplier: number,
  allClearBonus = false,
  uniColorBonus = false
): number {
  if (clearedSquares <= 0 && clearedCells <= 0) return 0;
  const clampedCombo = Math.max(1, comboMultiplier);
  // Multi-square sweeps scale quadratically like classic Lumines (e.g. 4 squares in one sweep = big multiplier)
  const squarePoints = clearedSquares * 120 * (1 + Math.max(0, clearedSquares - 1) * 0.35);
  const cellPoints = clearedCells * 15;
  let total = Math.round((squarePoints + cellPoints) * (1 + (clampedCombo - 1) * 0.4));
  if (allClearBonus) total += 5000;
  if (uniColorBonus) total += 1500;
  return total;
}

/**
 * Calculates current level, active skin, BPM, gravity fall interval (seconds per row),
 * and timeline sweep speed (columns per second) based on total cleared squares.
 */
export function calculateProgression(
  totalClearedSquares: number,
  customSkins: SkinTheme[] = BUILTIN_SKINS
): {
  level: number;
  skinIndex: number;
  skin: SkinTheme;
  bpm: number;
  gravityRowIntervalSec: number;
  sweepColsPerSec: number;
  progressToNextLevel: number;
} {
  const squaresPerLevel = 12;
  const level = Math.floor(Math.max(0, totalClearedSquares) / squaresPerLevel) + 1;
  const progressToNextLevel = (Math.max(0, totalClearedSquares) % squaresPerLevel) / squaresPerLevel;

  const paletteList = customSkins.length > 0 ? customSkins : BUILTIN_SKINS;
  const skinIndex = Math.min(paletteList.length - 1, Math.floor((level - 1) / 2));
  const skin = paletteList[skinIndex];

  // BPM increases slightly within each skin tier to match progressive intensity
  const subTier = (level - 1) % 2;
  const extraLevels = Math.max(0, level - paletteList.length * 2);
  const bpm = Math.min(172, skin.bpm + subTier * 3 + extraLevels * 2);

  // 2 bars (8 beats) per full 16-column timeline sweep => 2 columns per beat
  const beatsPerSec = bpm / 60;
  const sweepColsPerSec = beatsPerSec * 2;

  // Gravity starts approachable (~0.85s per row at level 1) and tightens with BPM/level
  const gravityRowIntervalSec = Math.max(0.16, 0.88 - (level - 1) * 0.045);

  return {
    level,
    skinIndex,
    skin,
    bpm,
    gravityRowIntervalSec,
    sweepColsPerSec,
    progressToNextLevel,
  };
}

export interface GlintPoint {
  x: number;
  y: number;
}

/**
 * Given a normalized progress t in [0, 1) around a rectangle (x, y, w, h),
 * returns the 2D point on its clockwise perimeter (top -> right -> bottom -> left).
 */
export function pointOnRectPerimeter(
  t: number,
  x: number,
  y: number,
  w: number,
  h: number
): GlintPoint {
  const normT = ((t % 1) + 1) % 1;
  const perimeter = 2 * (w + h);
  let dist = normT * perimeter;

  // Top edge: (x, y) -> (x + w, y)
  if (dist <= w) {
    return { x: x + dist, y };
  }
  dist -= w;

  // Right edge: (x + w, y) -> (x + w, y + h)
  if (dist <= h) {
    return { x: x + w, y: y + dist };
  }
  dist -= h;

  // Bottom edge: (x + w, y + h) -> (x, y + h)
  if (dist <= w) {
    return { x: x + w - dist, y: y + h };
  }
  dist -= w;

  // Left edge: (x, y + h) -> (x, y)
  return { x, y: y + h - dist };
}

/**
 * Computes a polyline of points tracing the sweeping glint arc along a 2x2 square module border
 * from `headProgress - trailFraction` to `headProgress`.
 */
export function computeSquarePerimeterGlint(
  headProgress: number,
  x: number,
  y: number,
  w: number,
  h: number,
  trailFraction = 0.28,
  sampleCount = 12
): {
  head: GlintPoint;
  points: GlintPoint[];
} {
  const steps = Math.max(2, sampleCount);
  const points: GlintPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const sampleT = headProgress - trailFraction * (1 - ratio);
    points.push(pointOnRectPerimeter(sampleT, x, y, w, h));
  }
  return {
    head: points[points.length - 1],
    points,
  };
}

/**
 * Classifies a completed pointer/touch gesture when the user lifts their finger/thumb.
 * - 'tapRotateCW': Quick tap with minimal travel -> rotates block 90 degrees CW.
 * - 'hardDropSwipe': Brisk downward swipe -> drops block directly to the bottom.
 * - 'none': Already handled continuously during drag (left/right/soft-drop steps).
 */
export function classifyTouchEndGesture(
  totalDx: number,
  totalDy: number,
  elapsedMs: number,
  alreadySteppedDuringDrag: boolean
): 'tapRotateCW' | 'hardDropSwipe' | 'none' {
  const dist = Math.hypot(totalDx, totalDy);

  // Fast downward flick drops the piece directly down even if a small drag occurred
  const velocityY = totalDy / Math.max(1, elapsedMs);
  if (totalDy >= 36 && Math.abs(totalDy) > Math.abs(totalDx) * 1.25 && (elapsedMs < 380 || velocityY > 0.32)) {
    return 'hardDropSwipe';
  }

  // Clean tap rotates 90 degrees clockwise every time
  if (!alreadySteppedDuringDrag && dist < 16 && elapsedMs < 320) {
    return 'tapRotateCW';
  }

  return 'none';
}

export interface SweepContactCell {
  row: number;
  col: number;
  color: BlockColor;
  isMatched: boolean;
  isSwept: boolean;
  crossedLeadingEdge: boolean;
}

/**
 * Finds all occupied board cells currently intersected by the timeline scanner bar at `nextColFloat`,
 * flagging whether the scanner just crossed into a new column (`crossedLeadingEdge`) so the particle
 * system can emit rhythm-synced sparkle particles along the sweep bar.
 */
export function findSweepBarBlockContacts(
  board: BoardGrid,
  prevColFloat: number,
  nextColFloat: number
): SweepContactCell[] {
  const rows = board.length;
  const cols = board[0]?.length || GRID_COLS;
  const prevColIdx = ((Math.floor(prevColFloat) % cols) + cols) % cols;
  const nextColIdx = ((Math.floor(nextColFloat) % cols) + cols) % cols;
  const crossedLeadingEdge = prevColIdx !== nextColIdx;

  const contacts: SweepContactCell[] = [];
  for (let r = 0; r < rows; r++) {
    const cell = board[r][nextColIdx];
    if (cell !== null) {
      contacts.push({
        row: r,
        col: nextColIdx,
        color: cell.color,
        isMatched: Boolean(cell.isMatched),
        isSwept: Boolean(cell.isSwept),
        crossedLeadingEdge,
      });
    }
  }

  return contacts;
}

export interface ShatterFragmentSpec {
  /** Normalized X center offset (0..1) within the parent block cell */
  offsetXNorm: number;
  /** Normalized Y center offset (0..1) within the parent block cell */
  offsetYNorm: number;
  /** Horizontal drift velocity in px/sec */
  vx: number;
  /** Vertical drift velocity in px/sec */
  vy: number;
  /** Angular rotation speed in rad/sec */
  vRot: number;
  /** Fragment side length as a fraction of cellSize */
  sizeFraction: number;
  /** True if this fragment represents an inner bevel highlight shard */
  isInnerShard: boolean;
}

/**
 * Subdivides a cleared block cell into a `subdivisions × subdivisions` grid of smaller geometric
 * fragments with outward radial dispersion and buoyant drift velocities so cleared rows/blocks
 * visibly shatter into smaller fragments that drift away.
 */
export function computeCellShatterFragments(
  cell: ClearedCellInfo,
  subdivisions = 3,
  rng: () => number = Math.random
): ShatterFragmentSpec[] {
  const n = Math.max(2, Math.min(4, Math.floor(subdivisions)));
  const fragments: ShatterFragmentSpec[] = [];
  const step = 1 / n;

  // Bias horizontal drift slightly away from board center and in the wake of the sweep bar
  const colCenterBias = (cell.col - (GRID_COLS - 1) / 2) * 5.5;

  for (let sr = 0; sr < n; sr++) {
    for (let sc = 0; sc < n; sc++) {
      const offsetXNorm = (sc + 0.5) * step;
      const offsetYNorm = (sr + 0.5) * step;

      // Vector from block center (-0.5..+0.5)
      const relX = offsetXNorm - 0.5;
      const relY = offsetYNorm - 0.5;
      const jitterAngle = (rng() - 0.5) * 0.65;
      const baseAngle = Math.atan2(relY, relX) + jitterAngle;
      const radialSpeed = 38 + rng() * 68;

      // Combine radial crack separation with gentle upward-and-sideways drift
      const vx = Math.cos(baseAngle) * radialSpeed + colCenterBias + (rng() - 0.5) * 28;
      const vy = Math.sin(baseAngle) * radialSpeed - (26 + rng() * 38);
      const vRot = (rng() < 0.5 ? -1 : 1) * (2.4 + rng() * 5.2);
      const sizeFraction = step * (0.72 + rng() * 0.22);
      const isInnerShard =
        (sr === Math.floor(n / 2) && sc === Math.floor(n / 2)) || (sr + sc) % 2 === 1;

      fragments.push({
        offsetXNorm,
        offsetYNorm,
        vx,
        vy,
        vRot,
        sizeFraction,
        isInnerShard,
      });
    }
  }

  return fragments;
}

/**
 * Checks if any horizontal row across all 16 columns is completely filled with blocks,
 * clearing those rows, applying gravity, and returning the cleared cells and row indices
 * so they shatter into drifting fragments.
 */
export function clearFullHorizontalRows(board: BoardGrid): {
  board: BoardGrid;
  clearedCells: ClearedCellInfo[];
  clearedRowIndices: number[];
} {
  const next = cloneBoard(board);
  const rows = next.length;
  const cols = next[0]?.length || GRID_COLS;
  const clearedCells: ClearedCellInfo[] = [];
  const clearedRowIndices: number[] = [];

  for (let r = 0; r < rows; r++) {
    let full = true;
    for (let c = 0; c < cols; c++) {
      if (next[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) {
      clearedRowIndices.push(r);
      for (let c = 0; c < cols; c++) {
        const cell = next[r][c]!;
        clearedCells.push({
          row: r,
          col: c,
          color: cell.color,
          isSpecial: Boolean(cell.isSpecial),
        });
        next[r][c] = null;
      }
    }
  }

  if (clearedRowIndices.length === 0) {
    return { board: next, clearedCells: [], clearedRowIndices: [] };
  }

  const grav = applyGravity(next);
  return {
    board: grav.board,
    clearedCells,
    clearedRowIndices,
  };
}

/**
 * Computes a subtle scale multiplier (e.g. 1.0 -> 1.085) for HUD numerical displays
 * (Score, Level) driven by the 0..1 beat-pulse envelope from the audio engine.
 * Quantized into clean envelope steps so CSS transitions animate smoothly on every primary beat
 * without mutating DOM attributes on every 60Hz frame.
 */
export function computeBeatHudScale(beatPulse: number, maxGrowth = 0.085): number {
  if (!Number.isFinite(beatPulse) || beatPulse < 0.32 || maxGrowth <= 0) {
    return 1;
  }
  const clamped = Math.min(1, Math.max(0, beatPulse));
  if (clamped >= 0.64) {
    return Number((1 + maxGrowth).toFixed(4));
  }
  return Number((1 + maxGrowth * 0.45).toFixed(4));
}

export interface LightTrailBeatMetrics {
  /** Current beat frequency in Hz (beats per second) */
  beatFreqHz: number;
  /** Emission rate (trails per second across both sides of the board) */
  emissionRatePerSec: number;
  /** Dynamic length multiplier that grows with BPM and pulsates on every beat */
  trailLengthScale: number;
  /** Dynamic stroke thickness in px that pulsates with the beat */
  trailThickness: number;
  /** Outward velocity multiplier scaled by beat frequency and pulse */
  speedScale: number;
}

/**
 * Computes rhythmic pulsation and growth metrics for background 'light trail' particles
 * emitted from the left and right sides of the board based on current BPM (beat frequency)
 * and the 0..1 audio beat-pulse envelope.
 */
export function computeLightTrailBeatMetrics(
  bpm: number,
  beatPulse: number
): LightTrailBeatMetrics {
  const safeBpm = Number.isFinite(bpm) ? Math.max(60, Math.min(220, bpm)) : 116;
  const clampedPulse = Number.isFinite(beatPulse) ? Math.min(1, Math.max(0, beatPulse)) : 0;

  const beatFreqHz = safeBpm / 60;
  const freqFactor = Math.max(0.6, beatFreqHz / 1.9333); // Normalized to 116 BPM baseline

  const emissionRatePerSec = beatFreqHz * (7.5 + clampedPulse * 14.0);
  const trailLengthScale = Number(
    (freqFactor * (0.95 + clampedPulse * 1.15)).toFixed(4)
  );
  const trailThickness = Number(
    (2.2 + (freqFactor - 0.8) * 1.4 + clampedPulse * 3.6).toFixed(3)
  );
  const speedScale = Number(
    (freqFactor * (0.92 + clampedPulse * 0.78)).toFixed(4)
  );

  return {
    beatFreqHz: Number(beatFreqHz.toFixed(4)),
    emissionRatePerSec: Number(emissionRatePerSec.toFixed(3)),
    trailLengthScale,
    trailThickness,
    speedScale,
  };
}

export interface KittenBeatDanceState {
  /** Vertical bounce offset in px (negative = jumping upward) */
  bounceY: number;
  /** Squash-and-stretch horizontal scale */
  scaleX: number;
  /** Squash-and-stretch vertical scale */
  scaleY: number;
  /** Ear twitch angle in radians */
  earAngle: number;
  /** Tail wag angle in radians */
  tailAngle: number;
  /** Whether the kitten is actively cheering with joy */
  isCheering: boolean;
}

/**
 * Computes beat-synced bounce, squash-and-stretch, ear twitch, and tail wag animation state
 * for the on-screen Cat & Kitten companions based on current BPM, beatPulse, and excitement timer.
 */
export function computeKittenBeatDance(
  nowMs: number,
  bpm: number,
  beatPulse: number,
  kittenIndex: number,
  excitementTimerSec = 0
): KittenBeatDanceState {
  const safeBpm = Number.isFinite(bpm) ? Math.max(60, Math.min(220, bpm)) : 116;
  const clampedPulse = Number.isFinite(beatPulse) ? Math.min(1, Math.max(0, beatPulse)) : 0;
  const beatFreqHz = safeBpm / 60;
  const isCheering = excitementTimerSec > 0.01;
  const cheerBoost = isCheering ? 1.45 : 1.0;

  const phase = nowMs * 0.001 * beatFreqHz * Math.PI * 2 + kittenIndex * 0.85;
  const hopWave = Math.max(0, Math.sin(phase));
  const bounceY = -(clampedPulse * 7.5 + hopWave * 4.5) * cheerBoost;

  const stretch = clampedPulse * 0.12 * cheerBoost;
  const scaleX = Number((1 - stretch * 0.45).toFixed(4));
  const scaleY = Number((1 + stretch).toFixed(4));

  const earAngle = Number(
    (Math.sin(phase * 1.5) * (0.14 + clampedPulse * 0.18) * cheerBoost).toFixed(4)
  );
  const tailAngle = Number(
    (Math.cos(phase * 1.25) * (0.38 + clampedPulse * 0.32) * cheerBoost).toFixed(4)
  );

  return {
    bounceY: Number(bounceY.toFixed(3)),
    scaleX,
    scaleY,
    earAngle,
    tailAngle,
    isCheering,
  };
}







