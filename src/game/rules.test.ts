import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID_COLS,
  GRID_ROWS,
  applyGravity,
  calculateProgression,
  calculateSweepScore,
  canPieceOccupy,
  classifyTouchEndGesture,
  clearFullHorizontalRows,
  computeBeatHudScale,
  computeCellShatterFragments,
  computeKittenBeatDance,
  computeLightTrailBeatMetrics,
  computeSquarePerimeterGlint,
  createActivePiece,
  createEmptyBoard,
  detectSquares,
  findSweepBarBlockContacts,
  lockPieceSplitGravity,
  pointOnRectPerimeter,
  rotateCellsCCW,
  rotateCellsCW,
  stepTimelineSweep,
} from './rules';
import { CellMatrix2x2 } from './types';

test('2x2 piece rotation CW and CCW are exact inverses and shift corners properly', () => {
  const initial: CellMatrix2x2 = [
    [{ color: 1 }, { color: 2 }],
    [{ color: 2, isSpecial: true }, { color: 1 }],
  ];

  const cw = rotateCellsCW(initial);
  // [C, A] -> [2(special), 1]
  // [D, B] -> [1, 2]
  assert.equal(cw[0][0].color, 2);
  assert.equal(cw[0][0].isSpecial, true);
  assert.equal(cw[0][1].color, 1);
  assert.equal(cw[1][0].color, 1);
  assert.equal(cw[1][1].color, 2);

  const back = rotateCellsCCW(cw);
  assert.deepEqual(back, initial);
});

test('split-column gravity drops left and right columns independently on uneven surfaces', () => {
  const board = createEmptyBoard();
  // Build a 3-block pillar in column 5 (rows 9, 8, 7 occupied), leaving column 6 completely empty
  board[9][5] = { color: 1 };
  board[8][5] = { color: 2 };
  board[7][5] = { color: 1 };

  const piece = createActivePiece([
    [{ color: 2 }, { color: 2 }],
    [{ color: 1 }, { color: 1 }],
  ]);
  piece.col = 5;
  piece.row = 4;

  const { board: next, overflowed } = lockPieceSplitGravity(board, piece);
  assert.equal(overflowed, false);

  // Left half (col 5) should rest on top of row 7 -> rows 6 and 5
  assert.equal(next[6][5]?.color, 1);
  assert.equal(next[5][5]?.color, 2);

  // Right half (col 6) should fall all the way to the floor -> rows 9 and 8
  assert.equal(next[9][6]?.color, 1);
  assert.equal(next[8][6]?.color, 2);
});

test('detectSquares identifies 2x2 same-color squares, overlapping 3x2 clusters, and special chain gems', () => {
  const board = createEmptyBoard();
  // Create a 3x2 rectangle of Color 1 at bottom-left (cols 0..2, rows 8..9)
  for (let r = 8; r <= 9; r++) {
    for (let c = 0; c <= 2; c++) {
      board[r][c] = { color: 1 };
    }
  }
  // Attach a special gem at (8, 2) and a trailing chain of Color 1 at (8, 3) and (8, 4)
  board[8][2] = { color: 1, isSpecial: true };
  board[8][3] = { color: 1 };
  board[8][4] = { color: 1 };

  const { board: detected, squares, matchedCellCount } = detectSquares(board);
  // Two overlapping 2x2 squares (at col 0 and col 1)
  assert.equal(squares.length, 2);
  // 6 cells in the 3x2 + 2 chained cells = 8 matched cells
  assert.equal(matchedCellCount, 8);
  assert.equal(detected[8][4]?.isMatched, true);
});

test('stepTimelineSweep sweeps matched squares, erases cluster once bar passes, and applies gravity', () => {
  let board = createEmptyBoard();
  // Place a 2x2 square of Color 2 at cols 2..3, rows 8..9
  board[8][2] = { color: 2 };
  board[8][3] = { color: 2 };
  board[9][2] = { color: 2 };
  board[9][3] = { color: 2 };

  // Place an unmatched block of Color 1 resting on top of the square at (7, 2)
  board[7][2] = { color: 1 };

  // Step timeline across cols 0 -> 5 (passing right edge col 4 and empty col 4)
  const stepResult = stepTimelineSweep(board, 0, 5.2, 0);
  assert.equal(stepResult.clearedSquaresThisStep, 1);
  assert.equal(stepResult.clearedCellsCount, 4);
  assert.ok(stepResult.scoreDelta > 0);
  assert.equal(stepResult.nextCombo, 1);

  // The Color 1 block that was at (7, 2) should have fallen to the floor at (9, 2)
  assert.equal(stepResult.board[9][2]?.color, 1);
  assert.equal(stepResult.board[8][2], null);
  assert.equal(stepResult.board[9][3], null);
});

test('calculateProgression scales BPM, sweep speed, and gravity interval smoothly with cleared squares', () => {
  const startProg = calculateProgression(0);
  const midProg = calculateProgression(30);
  const lateProg = calculateProgression(100);

  assert.equal(startProg.level, 1);
  assert.ok(midProg.level > startProg.level);
  assert.ok(lateProg.bpm > startProg.bpm);
  assert.ok(lateProg.sweepColsPerSec > startProg.sweepColsPerSec);
  assert.ok(lateProg.gravityRowIntervalSec < startProg.gravityRowIntervalSec);
});

test('canPieceOccupy enforces walls and settled blocks', () => {
  const board = createEmptyBoard();
  assert.equal(canPieceOccupy(board, 0, 0), true);
  assert.equal(canPieceOccupy(board, -1, 0), false);
  assert.equal(canPieceOccupy(board, GRID_COLS - 1, 0), false);
  assert.equal(canPieceOccupy(board, 0, GRID_ROWS - 1), false);

  board[4][4] = { color: 1 };
  assert.equal(canPieceOccupy(board, 3, 3), false);
});

test('computeSquarePerimeterGlint traces all 4 edges of a 2x2 square border accurately', () => {
  // Square at (10, 20) with width=80, height=80
  const topLeft = pointOnRectPerimeter(0, 10, 20, 80, 80);
  assert.deepEqual(topLeft, { x: 10, y: 20 });

  const topRight = pointOnRectPerimeter(0.25, 10, 20, 80, 80);
  assert.deepEqual(topRight, { x: 90, y: 20 });

  const bottomRight = pointOnRectPerimeter(0.5, 10, 20, 80, 80);
  assert.deepEqual(bottomRight, { x: 90, y: 100 });

  const bottomLeft = pointOnRectPerimeter(0.75, 10, 20, 80, 80);
  assert.deepEqual(bottomLeft, { x: 10, y: 100 });

  const glint = computeSquarePerimeterGlint(0.5, 10, 20, 80, 80, 0.25, 8);
  assert.equal(glint.points.length, 9);
  assert.deepEqual(glint.head, { x: 90, y: 100 });
  assert.deepEqual(glint.points[0], { x: 90, y: 20 });
});

test('classifyTouchEndGesture distinguishes 90-degree tap rotation from downward swipe drop', () => {
  assert.equal(classifyTouchEndGesture(3, -2, 110, false), 'tapRotateCW');
  assert.equal(classifyTouchEndGesture(4, 72, 160, false), 'hardDropSwipe');
  assert.equal(classifyTouchEndGesture(65, 5, 220, true), 'none');
});

test('findSweepBarBlockContacts identifies blocks under the sweep bar and flags leading-edge crossings', () => {
  const board = createEmptyBoard();
  board[8][5] = { color: 1, isMatched: true };
  board[9][5] = { color: 2, isMatched: false };

  // Crossing from col 4.9 -> 5.1 should report both cells in col 5 with crossedLeadingEdge = true
  const edgeContacts = findSweepBarBlockContacts(board, 4.9, 5.1);
  assert.equal(edgeContacts.length, 2);
  assert.equal(edgeContacts[0].row, 8);
  assert.equal(edgeContacts[0].col, 5);
  assert.equal(edgeContacts[0].color, 1);
  assert.equal(edgeContacts[0].isMatched, true);
  assert.equal(edgeContacts[0].crossedLeadingEdge, true);
  assert.equal(edgeContacts[1].row, 9);
  assert.equal(edgeContacts[1].color, 2);

  // Moving within col 5 (5.1 -> 5.4) still detects the cells with crossedLeadingEdge = false
  const glideContacts = findSweepBarBlockContacts(board, 5.1, 5.4);
  assert.equal(glideContacts.length, 2);
  assert.equal(glideContacts[0].crossedLeadingEdge, false);

  // Empty column 6 returns zero contacts
  const emptyContacts = findSweepBarBlockContacts(board, 5.9, 6.1);
  assert.equal(emptyContacts.length, 0);
});

test('row clear and sweep clear return clearedCells and subdivide blocks into drifting shatter fragments', () => {
  const board = createEmptyBoard();
  // Fill row 9 completely across all 16 columns, and place a single block at (8, 4) above it
  for (let c = 0; c < GRID_COLS; c++) {
    board[9][c] = { color: c % 2 === 0 ? 1 : 2 };
  }
  board[8][4] = { color: 1 };

  const rowResult = clearFullHorizontalRows(board);
  assert.deepEqual(rowResult.clearedRowIndices, [9]);
  assert.equal(rowResult.clearedCells.length, GRID_COLS);
  // The block at (8, 4) should fall into (9, 4) after row 9 shatters
  assert.equal(rowResult.board[9][4]?.color, 1);
  assert.equal(rowResult.board[8][4], null);

  // Subdividing a cleared cell into 3x3 produces 9 distinct sub-cell fragments with drift velocities
  const fragments = computeCellShatterFragments(rowResult.clearedCells[0], 3, () => 0.5);
  assert.equal(fragments.length, 9);
  assert.ok(fragments[0].offsetXNorm > 0 && fragments[0].offsetXNorm < 0.5);
  assert.ok(fragments[8].offsetXNorm > 0.5 && fragments[8].offsetXNorm < 1);
  assert.ok(Number.isFinite(fragments[0].vx) && Number.isFinite(fragments[0].vy));
});

test('computeBeatHudScale scales HUD numerals smoothly between 1.0 and 1 + maxGrowth on musical beats', () => {
  assert.equal(computeBeatHudScale(0, 0.085), 1);
  assert.equal(computeBeatHudScale(-0.5, 0.085), 1);
  assert.equal(computeBeatHudScale(0.2, 0.085), 1);
  assert.equal(computeBeatHudScale(0.9, 0.085), 1.085);
  const midBeat = computeBeatHudScale(0.5, 0.085);
  assert.ok(midBeat > 1.03 && midBeat < 1.06);
});

test('computeLightTrailBeatMetrics increases trail length, thickness, and emission rate with BPM and beatPulse', () => {
  const calm = computeLightTrailBeatMetrics(116, 0);
  const beatPeak = computeLightTrailBeatMetrics(116, 1);
  const highBpmPeak = computeLightTrailBeatMetrics(150, 1);

  assert.ok(beatPeak.trailLengthScale > calm.trailLengthScale);
  assert.ok(beatPeak.trailThickness > calm.trailThickness);
  assert.ok(beatPeak.emissionRatePerSec > calm.emissionRatePerSec);
  assert.ok(highBpmPeak.beatFreqHz > beatPeak.beatFreqHz);
  assert.ok(highBpmPeak.trailLengthScale > beatPeak.trailLengthScale);
  assert.ok(highBpmPeak.speedScale > calm.speedScale);
});

test('computeKittenBeatDance animates kitten hop, squash-and-stretch, and cheering boost on the beat', () => {
  const rest = computeKittenBeatDance(0, 120, 0, 0, 0);
  const beatJump = computeKittenBeatDance(125, 120, 1, 0, 0);
  const cheeringJump = computeKittenBeatDance(125, 120, 1, 0, 1.2);

  assert.equal(rest.isCheering, false);
  assert.equal(cheeringJump.isCheering, true);
  assert.ok(beatJump.bounceY < rest.bounceY);
  assert.ok(cheeringJump.bounceY < beatJump.bounceY);
  assert.ok(cheeringJump.scaleY > beatJump.scaleY);
});







