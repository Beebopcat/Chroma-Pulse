export type BlockColor = 1 | 2;

export interface GridCell {
  color: BlockColor;
  /** Special pulse gem block that chains adjacent same-color blocks when part of a 2x2 square */
  isSpecial?: boolean;
  /** True when currently part of a valid 2x2 same-color square (or chained to one) */
  isMatched?: boolean;
  /** True once the timeline bar has swept across this matched cell during the current pass */
  isSwept?: boolean;
  /** Timestamp or counter for visual pulse animation */
  matchedAt?: number;
}

export type CellMatrix2x2 = [
  [ GridCell, GridCell ],
  [ GridCell, GridCell ]
];

export interface ActivePiece {
  /** Column of top-left cell (0 to GRID_COLS - 2) */
  col: number;
  /** Row of top-left cell (-2 to GRID_ROWS - 2, where < 0 is staging zone above grid) */
  row: number;
  /** Smooth visual Y offset (0..1) for gravity interpolation */
  fallProgress: number;
  /** 2x2 cells: [rowOffset 0..1][colOffset 0..1] */
  cells: CellMatrix2x2;
  /** Visual rotation angle in radians (decays toward 0) */
  visualRotation: number;
}

export interface FallingFragment {
  id: number;
  col: number;
  row: number;
  targetRow: number;
  yProgress: number;
  cell: GridCell;
}

export interface SquareMatch {
  /** Top-left column of the 2x2 square */
  col: number;
  /** Top-left row of the 2x2 square */
  row: number;
  color: BlockColor;
  /** Whether the timeline bar has already crossed the right edge of this square */
  swept: boolean;
}

export type GameStateMode = 'title' | 'playing' | 'paused' | 'gameover';

export interface SkinTheme {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  bpm: number;
  /** Background primary dark canvas */
  bgCanvas: string;
  /** Secondary structural grid surface */
  gridSurface: string;
  /** Grid hairline color */
  gridLine: string;
  /** Color 1 (Light / Primary block fill & glow) */
  color1Fill: string;
  color1Inner: string;
  color1Border: string;
  color1Name: string;
  /** Color 2 (Dark / Secondary high-contrast block fill & glow) */
  color2Fill: string;
  color2Inner: string;
  color2Border: string;
  color2Name: string;
  /** Timeline sweep bar accent */
  timelineAccent: string;
  /** Musical scale MIDI root and intervals for procedural synth */
  rootMidi: number;
  scaleIntervals: number[];
  bassPattern: number[];
  arpPattern: number[];
  /** Optional custom backdrop image Data URL from Gemini Skin Studio or procedural generator */
  customBackdropUrl?: string;
}

export interface EndOfRunSnapshot {
  score: number;
  highScore: number;
  clearedSquares: number;
  maxSweepCombo: number;
  levelReached: number;
  skinName: string;
  peakBpm: number;
  durationSec: number;
}
