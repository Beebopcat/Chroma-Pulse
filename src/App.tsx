/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivePiece,
  CellMatrix2x2,
  EndOfRunSnapshot,
  GameStateMode,
  SkinTheme,
  SquareMatch,
} from './game/types';
import { BUILTIN_SKINS } from './game/skins';
import {
  BoardGrid,
  ClearedCellInfo,
  GRID_COLS,
  GRID_ROWS,
  calculateProgression,
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
  createPieceCells,
  detectSquares,
  findSweepBarBlockContacts,
  lockPieceSplitGravity,
  rotateCellsCCW,
  rotateCellsCW,
  stepTimelineSweep,
} from './game/rules';
import { audioEngine } from './game/audio';
import { haptics } from './game/haptics';
import { TitleScreen } from './components/TitleScreen';
import { GameHud } from './components/GameHud';
import { StatusModal } from './components/StatusModal';
import { SkinStudioModal } from './components/SkinStudioModal';

interface PooledParticle {
  active: boolean;
  kind: 'burst' | 'sparkle' | 'fragment' | 'paw' | 'heart';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  secondaryColor: string;
  rotation: number;
  vRot: number;
  twinklePhase: number;
}

interface FloatingPopup {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  subtext: string;
  color: string;
  life: number;
  maxLife: number;
}

interface PooledLightTrail {
  active: boolean;
  /** -1 = emitted from left border of board, +1 = emitted from right border of board */
  side: -1 | 1;
  /** Normalized vertical position (0..1) along the board's side border */
  rowNorm: number;
  /** Outward horizontal distance traveled from the board's side border in px */
  distFromEdge: number;
  /** Accumulated vertical drift offset in px */
  yOffset: number;
  /** Outward horizontal speed in px/sec */
  speed: number;
  /** Vertical drift speed in px/sec */
  vy: number;
  /** Base trail ribbon length in px before beat-frequency pulsation scaling */
  baseLength: number;
  /** Base stroke thickness in px */
  thickness: number;
  life: number;
  maxLife: number;
  color: string;
  accentColor: string;
  wavePhase: number;
}

const MAX_PARTICLES = 540;
const MAX_POPUPS = 16;
const MAX_LIGHT_TRAILS = 96;
const HIGH_SCORE_STORAGE_KEY = 'chroma_pulse_high_score_v1';

export default function App() {
  // Skins & UI State
  const [skins, setSkins] = useState<SkinTheme[]>(() => BUILTIN_SKINS.map((s) => ({ ...s })));
  const [selectedSkinIdx, setSelectedSkinIdx] = useState<number>(0);
  const [mode, setMode] = useState<GameStateMode>('title');
  const [isSkinStudioOpen, setIsSkinStudioOpen] = useState<boolean>(false);

  // HUD Display State (throttled to discrete changes, never updated at 60Hz unless integer changes)
  const [hudScore, setHudScore] = useState<number>(0);
  const [hudHighScore, setHudHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(HIGH_SCORE_STORAGE_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [hudSquares, setHudSquares] = useState<number>(0);
  const [hudCombo, setHudCombo] = useState<number>(1);
  const [hudSweptPending, setHudSweptPending] = useState<number>(0);
  const [hudLevel, setHudLevel] = useState<number>(1);
  const [hudBpm, setHudBpm] = useState<number>(BUILTIN_SKINS[0].bpm);
  const [hudSkin, setHudSkin] = useState<SkinTheme>(BUILTIN_SKINS[0]);
  const [hudNextQueue, setHudNextQueue] = useState<CellMatrix2x2[]>(() => [
    createPieceCells(),
    createPieceCells(),
    createPieceCells(),
  ]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(true);
  const [hapticPulse, setHapticPulse] = useState<number>(0);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [runSnapshot, setRunSnapshot] = useState<EndOfRunSnapshot | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Mutable Simulation State inside ref so 60Hz loop is 100% decoupled from React reconciliation
  const simRef = useRef<{
    mode: GameStateMode;
    skins: SkinTheme[];
    startingSkinIdx: number;
    activeSkin: SkinTheme;
    board: BoardGrid;
    activePiece: ActivePiece;
    nextQueue: CellMatrix2x2[];
    squares: SquareMatch[];
    timelineCol: number;
    score: number;
    highScore: number;
    clearedSquares: number;
    combo: number;
    maxCombo: number;
    level: number;
    bpm: number;
    gravityIntervalSec: number;
    sweepColsPerSec: number;
    gravityTimer: number;
    lockDelayTimer: number;
    hitstopTimer: number;
    shakeTrauma: number;
    flashAlpha: number;
    startTimeMs: number;
    pointerXNorm: number;
    pointerYNorm: number;
    boardRect: { x: number; y: number; w: number; h: number; cellSize: number };
    particles: PooledParticle[];
    particleCursor: number;
    popups: FloatingPopup[];
    popupCursor: number;
    lightTrails: PooledLightTrail[];
    lightTrailCursor: number;
    lightTrailEmitAccum: number;
    touchStartX: number | null;
    touchStartY: number | null;
    touchAnchorX: number | null;
    touchAnchorY: number | null;
    touchLastMoveMs: number;
    touchSteppedDuringDrag: boolean;
    touchStartTime: number;
    clearedInCurrentPass: boolean;
    sparkleEmitAccum: number;
    lastHudBeatScale: number;
    kittenExcitementTimer: number;
    kittenPetCount: number;
  }>({
    mode: 'title',
    skins: BUILTIN_SKINS,
    startingSkinIdx: 0,
    activeSkin: BUILTIN_SKINS[0],
    board: createEmptyBoard(),
    activePiece: createActivePiece(createPieceCells()),
    nextQueue: [createPieceCells(), createPieceCells(), createPieceCells()],
    squares: [],
    timelineCol: 0,
    score: 0,
    highScore: Number(localStorage.getItem(HIGH_SCORE_STORAGE_KEY)) || 0,
    clearedSquares: 0,
    combo: 1,
    maxCombo: 1,
    level: 1,
    bpm: BUILTIN_SKINS[0].bpm,
    gravityIntervalSec: 0.85,
    sweepColsPerSec: (BUILTIN_SKINS[0].bpm / 60) * 2,
    gravityTimer: 0,
    lockDelayTimer: 0,
    hitstopTimer: 0,
    shakeTrauma: 0,
    flashAlpha: 0,
    startTimeMs: performance.now(),
    pointerXNorm: 0.5,
    pointerYNorm: 0.5,
    boardRect: { x: 0, y: 0, w: 640, h: 400, cellSize: 40 },
    particles: Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      kind: 'burst' as const,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 4,
      life: 0,
      maxLife: 1,
      color: '#00F0FF',
      secondaryColor: '#FFFFFF',
      rotation: 0,
      vRot: 0,
      twinklePhase: 0,
    })),
    particleCursor: 0,
    popups: Array.from({ length: MAX_POPUPS }, () => ({
      active: false,
      x: 0,
      y: 0,
      vy: -40,
      text: '',
      subtext: '',
      color: '#FFFFFF',
      life: 0,
      maxLife: 1,
    })),
    popupCursor: 0,
    lightTrails: Array.from({ length: MAX_LIGHT_TRAILS }, (_, idx) => {
      const seeded = idx < 18;
      const side: -1 | 1 = idx % 2 === 0 ? -1 : 1;
      const rowNorm = ((idx * 0.13 + 0.08) % 0.86) + 0.07;
      return {
        active: seeded,
        side,
        rowNorm,
        distFromEdge: seeded ? 12 + (idx % 6) * 18 : 0,
        yOffset: seeded ? (rowNorm - 0.5) * 24 : 0,
        speed: 78 + (idx % 5) * 18,
        vy: (rowNorm - 0.5) * 85,
        baseLength: 56 + (idx % 4) * 16,
        thickness: 2.4 + (idx % 3) * 0.6,
        life: seeded ? (idx % 5) * 0.12 : 0,
        maxLife: 1.15,
        color: idx % 3 === 0 ? BUILTIN_SKINS[0].color1Fill : BUILTIN_SKINS[0].color2Fill,
        accentColor: BUILTIN_SKINS[0].timelineAccent,
        wavePhase: idx * 0.7,
      };
    }),
    lightTrailCursor: 18,
    lightTrailEmitAccum: 0,
    touchStartX: null,
    touchStartY: null,
    touchAnchorX: null,
    touchAnchorY: null,
    touchLastMoveMs: 0,
    touchSteppedDuringDrag: false,
    touchStartTime: 0,
    clearedInCurrentPass: false,
    sparkleEmitAccum: 0,
    lastHudBeatScale: 1,
    kittenExcitementTimer: 0,
    kittenPetCount: 0,
  });

  const bannerTimeoutRef = useRef<number | null>(null);

  const showBanner = useCallback((text: string, durationMs = 2000) => {
    setBannerText(text);
    if (bannerTimeoutRef.current !== null) {
      window.clearTimeout(bannerTimeoutRef.current);
    }
    bannerTimeoutRef.current = window.setTimeout(() => {
      setBannerText(null);
    }, durationMs);
  }, []);

  // Sync body[data-state] attribute
  const updateGameStateMode = useCallback((nextMode: GameStateMode) => {
    simRef.current.mode = nextMode;
    document.body.dataset.state = nextMode;
    setMode(nextMode);
  }, []);

  // Spawn particles from pre-allocated ring buffer (Zero GC inside rAF)
  const spawnParticles = useCallback(
    (x: number, y: number, color: string, count: number, speedScale = 1) => {
      const sim = simRef.current;
      for (let i = 0; i < count; i++) {
        const p = sim.particles[sim.particleCursor];
        sim.particleCursor = (sim.particleCursor + 1) % MAX_PARTICLES;
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = (65 + Math.random() * 180) * speedScale;
        p.active = true;
        p.kind = 'burst';
        p.x = x + (Math.random() - 0.5) * 12;
        p.y = y + (Math.random() - 0.5) * 12;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 40;
        p.size = 3 + Math.random() * 5;
        p.life = 0;
        p.maxLife = 0.32 + Math.random() * 0.35;
        p.color = color;
        p.secondaryColor = '#FFFFFF';
        p.rotation = 0;
        p.vRot = 0;
        p.twinklePhase = 0;
      }
    },
    []
  );

  // Spawn subtle rhythm-synced 'sparkle' particles emitted from the timeline sweep bar as it passes over blocks
  const spawnSweepSparkle = useCallback(
    (x: number, y: number, color: string, isMatched: boolean, beatPulseVal: number, count = 1) => {
      const sim = simRef.current;
      for (let i = 0; i < count; i++) {
        const p = sim.particles[sim.particleCursor];
        sim.particleCursor = (sim.particleCursor + 1) % MAX_PARTICLES;
        p.active = true;
        p.kind = 'sparkle';
        p.x = x + (Math.random() - 0.5) * 5;
        p.y = y + (Math.random() - 0.5) * 14;
        // Trail softly to the left behind the rightward-moving timeline scanner with buoyant vertical drift
        const trailSpeed = 24 + Math.random() * 58 + beatPulseVal * 26;
        p.vx = -trailSpeed + (Math.random() - 0.5) * 16;
        p.vy = (Math.random() - 0.58) * 44;
        p.size = (isMatched ? 4.2 : 3.1) + Math.random() * 2.6 + beatPulseVal * 1.4;
        p.life = 0;
        p.maxLife = (isMatched ? 0.46 : 0.34) + Math.random() * 0.24;
        p.color = color;
        p.secondaryColor = '#FFFFFF';
        p.rotation = Math.random() * Math.PI;
        p.vRot = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 3.5);
        p.twinklePhase = Math.random() * Math.PI * 2;
      }
    },
    []
  );

  // Shatter cleared row blocks into smaller geometric sub-tile fragments that drift away using the pooled particle system
  const spawnBlockShatterFragments = useCallback((clearedCells: ClearedCellInfo[]) => {
    const sim = simRef.current;
    const { x: bx, y: by, cellSize } = sim.boardRect;
    const skin = sim.activeSkin;
    const subdivisions = cellSize >= 26 ? 3 : 2;

    for (const cell of clearedCells) {
      const primaryColor = cell.color === 1 ? skin.color1Fill : skin.color2Fill;
      const innerColor = cell.color === 1 ? skin.color1Inner : skin.color2Inner;
      const fragments = computeCellShatterFragments(cell, subdivisions);

      for (const frag of fragments) {
        const p = sim.particles[sim.particleCursor];
        sim.particleCursor = (sim.particleCursor + 1) % MAX_PARTICLES;
        p.active = true;
        p.kind = 'fragment';
        p.x = bx + (cell.col + frag.offsetXNorm) * cellSize;
        p.y = by + (cell.row + frag.offsetYNorm) * cellSize;
        p.vx = frag.vx;
        p.vy = frag.vy;
        p.size = Math.max(4.5, cellSize * frag.sizeFraction);
        p.life = 0;
        p.maxLife = 0.65 + Math.random() * 0.42;
        p.color = primaryColor;
        p.secondaryColor = frag.isInnerShard ? '#FFFFFF' : innerColor;
        p.rotation = (Math.random() - 0.5) * 0.35;
        p.vRot = frag.vRot;
        p.twinklePhase = Math.random() * Math.PI * 2;
      }
    }
  }, []);

  // Spawn background 'light trail' ribbon particles from the left (-1) or right (+1) side of the board
  const spawnSideLightTrail = useCallback(
    (side: -1 | 1, rowNorm?: number, initialDist = 0) => {
      const sim = simRef.current;
      const skin = sim.activeSkin;
      const trail = sim.lightTrails[sim.lightTrailCursor];
      sim.lightTrailCursor = (sim.lightTrailCursor + 1) % MAX_LIGHT_TRAILS;

      const rNorm =
        rowNorm !== undefined ? rowNorm : 0.06 + Math.random() * 0.88;
      const colorRoll = Math.random();
      const primaryColor =
        colorRoll < 0.45
          ? skin.color1Fill
          : colorRoll < 0.85
          ? skin.color2Fill
          : skin.timelineAccent;

      trail.active = true;
      trail.side = side;
      trail.rowNorm = rNorm;
      trail.distFromEdge = initialDist;
      trail.yOffset = initialDist * (rNorm - 0.5) * 0.4;
      trail.speed = 68 + Math.random() * 104;
      trail.vy = (rNorm - 0.5) * 96 + (Math.random() - 0.5) * 48;
      trail.baseLength = 48 + Math.random() * 68;
      trail.thickness = 2.0 + Math.random() * 1.8;
      trail.life = 0;
      trail.maxLife = 0.88 + Math.random() * 0.62;
      trail.color = primaryColor;
      trail.accentColor = skin.timelineAccent;
      trail.wavePhase = Math.random() * Math.PI * 2;
    },
    []
  );

  const spawnPopup = useCallback(
    (x: number, y: number, text: string, subtext: string, color: string) => {
      const sim = simRef.current;
      const pop = sim.popups[sim.popupCursor];
      sim.popupCursor = (sim.popupCursor + 1) % MAX_POPUPS;
      pop.active = true;
      pop.x = x;
      pop.y = y;
      pop.vy = -55;
      pop.text = text;
      pop.subtext = subtext;
      pop.color = color;
      pop.life = 0;
      pop.maxLife = 1.1;
    },
    []
  );

  // Spawn floating heart and toe-bean paw-print particles when kittens cheer or get petted
  const spawnKittenLoveParticles = useCallback(
    (x: number, y: number, primaryColor: string, count = 8) => {
      const sim = simRef.current;
      for (let i = 0; i < count; i++) {
        const p = sim.particles[sim.particleCursor];
        sim.particleCursor = (sim.particleCursor + 1) % MAX_PARTICLES;
        p.active = true;
        p.kind = i % 2 === 0 ? 'heart' : 'paw';
        p.x = x + (Math.random() - 0.5) * 44;
        p.y = y + (Math.random() - 0.5) * 14;
        p.vx = (Math.random() - 0.5) * 65;
        p.vy = -(48 + Math.random() * 68);
        p.size = 6.5 + Math.random() * 4.5;
        p.life = 0;
        p.maxLife = 0.78 + Math.random() * 0.45;
        p.color = i % 2 === 0 ? '#FF6B9D' : primaryColor;
        p.secondaryColor = '#FFFFFF';
        p.rotation = (Math.random() - 0.5) * 0.45;
        p.vRot = (Math.random() - 0.5) * 2.2;
        p.twinklePhase = Math.random() * Math.PI * 2;
      }
    },
    []
  );

  // Pet the DJ Cat & Kittens for a joyful meow, purr haptics, and floating hearts & paw prints!
  const handlePetKittens = useCallback(() => {
    const sim = simRef.current;
    sim.kittenExcitementTimer = 1.65;
    sim.kittenPetCount += 1;
    const { x: bx, y: by, w: bw } = sim.boardRect;

    spawnKittenLoveParticles(bx + 54, by - 20, sim.activeSkin.color1Fill, 7);
    spawnKittenLoveParticles(bx + bw - 68, by - 20, sim.activeSkin.color2Fill, 9);

    const cheers = ['MEW! ♥', 'PURR-FECT!', 'NYAA~ ★', 'KITTEN GROOVE!'];
    const msg = cheers[(sim.kittenPetCount - 1) % cheers.length];
    spawnPopup(
      bx + bw - 68,
      Math.max(48, by - 28),
      msg,
      'KITTEN CREW CHEER!',
      '#FF7EB6'
    );

    audioEngine.playActionSfx('meow', sim.kittenPetCount);
    haptics.trigger('squareLock', 2);
  }, [spawnKittenLoveParticles, spawnPopup]);

  // Start or restart a game run
  const startNewRun = useCallback(
    (startSkinIndex?: number) => {
      const sim = simRef.current;
      const skinIdx = startSkinIndex !== undefined ? startSkinIndex : sim.startingSkinIdx;
      sim.startingSkinIdx = skinIdx;

      // Rotate skin order so chosen starting skin is first in progression
      const orderedSkins = [
        ...sim.skins.slice(skinIdx),
        ...sim.skins.slice(0, skinIdx),
      ];

      const initialSkin = orderedSkins[0];
      const q0 = createPieceCells();
      const q1 = createPieceCells();
      const q2 = createPieceCells();
      const q3 = createPieceCells();

      sim.board = createEmptyBoard();
      sim.activePiece = createActivePiece(q0);
      sim.nextQueue = [q1, q2, q3];
      sim.squares = [];
      sim.timelineCol = 0;
      sim.score = 0;
      sim.clearedSquares = 0;
      sim.combo = 1;
      sim.maxCombo = 1;
      sim.clearedInCurrentPass = false;
      sim.level = 1;
      sim.activeSkin = initialSkin;
      sim.bpm = initialSkin.bpm;
      sim.gravityIntervalSec = 0.85;
      sim.sweepColsPerSec = (initialSkin.bpm / 60) * 2;
      sim.gravityTimer = 0;
      sim.lockDelayTimer = 0;
      sim.hitstopTimer = 0;
      sim.shakeTrauma = 0;
      sim.flashAlpha = 0.25;
      sim.startTimeMs = performance.now();

      // Support ?chain=1 or ?combo=N query parameter for testing active chain multiplier states
      const params = new URLSearchParams(window.location.search);
      const initChain = Number(params.get('chain') || params.get('combo') || 0);
      if (initChain > 1) {
        sim.combo = initChain;
        sim.maxCombo = initChain;
        sim.clearedInCurrentPass = true;
      }
      if (params.get('demoSquares') === '1') {
        // Seed settled blocks and two 2x2 matched square modules across the board so sweep sparkles and chain glint are immediately visible
        sim.board[8][1] = { color: 1 };
        sim.board[9][1] = { color: 2 };
        sim.board[8][2] = { color: 2 };
        sim.board[9][2] = { color: 1 };
        sim.board[7][3] = { color: 1 };
        sim.board[8][3] = { color: 2 };
        sim.board[9][3] = { color: 1 };
        sim.board[8][5] = { color: 1 };
        sim.board[8][6] = { color: 1 };
        sim.board[9][5] = { color: 1 };
        sim.board[9][6] = { color: 1 };
        sim.board[8][10] = { color: 2 };
        sim.board[8][11] = { color: 2 };
        sim.board[9][10] = { color: 2 };
        sim.board[9][11] = { color: 2 };
        const det = detectSquares(sim.board);
        sim.board = det.board;
        sim.squares = det.squares;
      }
      if (params.get('demoShatter') === '1') {
        // Seed staggered row clusters across columns 5..6, 8..9, and 11..12 and position the scanner
        // at 6.65 so row-clear block shattering into drifting fragments is visible across consecutive frames
        sim.board[8][8] = { color: 2 };
        sim.board[8][9] = { color: 2 };
        sim.board[9][8] = { color: 2 };
        sim.board[9][9] = { color: 2 };
        sim.board[8][12] = { color: 1 };
        sim.board[8][13] = { color: 1 };
        sim.board[9][12] = { color: 1 };
        sim.board[9][13] = { color: 1 };
        const detShatter = detectSquares(sim.board);
        sim.board = detShatter.board;
        sim.squares = detShatter.squares;
        sim.timelineCol = 6.65;
      }

      setHudScore(0);
      setHudSquares(0);
      setHudCombo(sim.combo);
      setHudSweptPending(0);
      setHudLevel(1);
      setHudBpm(initialSkin.bpm);
      setHudSkin(initialSkin);
      setHudNextQueue([q1, q2, q3]);
      setRunSnapshot(null);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      updateGameStateMode('playing');
      audioEngine.setSkinAndBpm(initialSkin, initialSkin.bpm);
      audioEngine.startLoop();
      audioEngine.playActionSfx('skinChange');
      haptics.trigger('skinChange');
      showBanner(`${initialSkin.name} · ${initialSkin.bpm} BPM`, 1800);
    },
    [showBanner, updateGameStateMode]
  );

  // Lock the active piece and spawn the next one
  const lockCurrentPieceAndAdvance = useCallback(() => {
    const sim = simRef.current;
    const { board: afterLock, overflowed, placedPositions } = lockPieceSplitGravity(
      sim.board,
      sim.activePiece
    );

    // Check if locking the piece completed any full 16-column horizontal row
    const rowClear = clearFullHorizontalRows(afterLock);
    const boardAfterRowClear = rowClear.board;

    const prevSquareCount = sim.squares.length;
    const detection = detectSquares(boardAfterRowClear, Math.floor(sim.timelineCol));
    sim.board = detection.board;
    sim.squares = detection.squares;

    // Visual & audio juice on landing
    const { x: bx, y: by, w: bw, cellSize } = sim.boardRect;
    for (const pos of placedPositions) {
      const px = bx + (pos.col + 0.5) * cellSize;
      const py = by + (pos.row + 0.5) * cellSize;
      const colHex = pos.cell.color === 1 ? sim.activeSkin.color1Fill : sim.activeSkin.color2Fill;
      spawnParticles(px, py, colHex, 5, 0.7);
    }

    if (rowClear.clearedCells.length > 0) {
      spawnBlockShatterFragments(rowClear.clearedCells);
      sim.kittenExcitementTimer = 1.5;
      spawnKittenLoveParticles(bx + bw - 68, by - 18, sim.activeSkin.timelineAccent, 6);
      const rowBonus = rowClear.clearedRowIndices.length * 1000;
      sim.score += rowBonus;
      sim.clearedSquares += rowClear.clearedRowIndices.length * 4;
      setHudScore(sim.score);
      setHudSquares(sim.clearedSquares);
      sim.shakeTrauma = Math.min(1, sim.shakeTrauma + 0.35);
      sim.flashAlpha = 0.32;
      const clearY = by + (rowClear.clearedRowIndices[0] + 0.5) * cellSize;
      spawnPopup(
        bx + bw * 0.5,
        clearY,
        `+${rowBonus.toLocaleString()}`,
        'ROW SHATTER CLEAR!',
        sim.activeSkin.timelineAccent
      );
      audioEngine.playActionSfx('sweepClear', sim.combo + 2);
      haptics.trigger('sweepClear', sim.combo + 1);
    }

    if (detection.squares.length > prevSquareCount) {
      const added = detection.squares.length - prevSquareCount;
      audioEngine.playActionSfx('squareLock', detection.squares.length);
      haptics.trigger('squareLock', added);
      sim.shakeTrauma = Math.min(1, sim.shakeTrauma + 0.22);
      sim.kittenExcitementTimer = Math.max(sim.kittenExcitementTimer, 1.15);

      const newestSq = detection.squares[detection.squares.length - 1];
      if (newestSq) {
        const sx = bx + (newestSq.col + 1) * cellSize;
        const sy = by + (newestSq.row + 1) * cellSize;
        const sqHex =
          newestSq.color === 1 ? sim.activeSkin.color1Fill : sim.activeSkin.color2Fill;
        spawnParticles(sx, sy, sqHex, 14, 1.0);
        spawnKittenLoveParticles(sx, sy, sqHex, 4);
      }
    }

    if (overflowed) {
      // Freeze end-of-run snapshot and transition to gameover
      audioEngine.stopLoop();
      audioEngine.playActionSfx('gameOver');
      haptics.trigger('gameOver');
      sim.shakeTrauma = 0.85;

      const best = Math.max(sim.highScore, sim.score);
      sim.highScore = best;
      try {
        localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(best));
      } catch {
        // Ignore storage error
      }
      setHudHighScore(best);

      const snapshot: EndOfRunSnapshot = {
        score: sim.score,
        highScore: best,
        clearedSquares: sim.clearedSquares,
        maxSweepCombo: sim.maxCombo,
        levelReached: sim.level,
        skinName: sim.activeSkin.name,
        peakBpm: sim.bpm,
        durationSec: Math.round((performance.now() - sim.startTimeMs) / 1000),
      };
      setRunSnapshot(snapshot);
      updateGameStateMode('gameover');
      return;
    }

    // Pop next piece from queue
    const nextCells = sim.nextQueue.shift() || createPieceCells();
    sim.nextQueue.push(createPieceCells());
    sim.activePiece = createActivePiece(nextCells);
    sim.gravityTimer = 0;
    sim.lockDelayTimer = 0;
    setHudNextQueue([...sim.nextQueue]);
  }, [
    spawnBlockShatterFragments,
    spawnKittenLoveParticles,
    spawnParticles,
    spawnPopup,
    updateGameStateMode,
  ]);

  // Execute discrete player actions (keyboard, HUD buttons, or touch gestures)
  const executePlayerAction = useCallback(
    (
      action:
        | 'left'
        | 'right'
        | 'rotateCCW'
        | 'rotateCW'
        | 'softDrop'
        | 'hardDrop'
    ) => {
      const sim = simRef.current;
      if (sim.mode !== 'playing') return;

      const piece = sim.activePiece;

      if (action === 'left') {
        if (canPieceOccupy(sim.board, piece.col - 1, piece.row)) {
          piece.col -= 1;
          audioEngine.playActionSfx('move');
          haptics.trigger('move');
        }
      } else if (action === 'right') {
        if (canPieceOccupy(sim.board, piece.col + 1, piece.row)) {
          piece.col += 1;
          audioEngine.playActionSfx('move');
          haptics.trigger('move');
        }
      } else if (action === 'rotateCW') {
        piece.cells = rotateCellsCW(piece.cells);
        piece.visualRotation = -Math.PI / 2;
        audioEngine.playActionSfx('rotateCW');
        haptics.trigger('rotate');
      } else if (action === 'rotateCCW') {
        piece.cells = rotateCellsCCW(piece.cells);
        piece.visualRotation = Math.PI / 2;
        audioEngine.playActionSfx('rotateCCW');
        haptics.trigger('rotate');
      } else if (action === 'softDrop') {
        if (canPieceOccupy(sim.board, piece.col, piece.row + 1)) {
          piece.row += 1;
          piece.fallProgress = 0;
          sim.score += 2;
          setHudScore(sim.score);
          haptics.trigger('softDrop');
        } else {
          lockCurrentPieceAndAdvance();
        }
      } else if (action === 'hardDrop') {
        let dropRows = 0;
        while (canPieceOccupy(sim.board, piece.col, piece.row + 1)) {
          piece.row += 1;
          dropRows++;
        }
        piece.fallProgress = 0;
        sim.score += Math.max(4, dropRows * 6);
        setHudScore(sim.score);
        sim.shakeTrauma = Math.min(1, sim.shakeTrauma + 0.28);
        audioEngine.playActionSfx('hardDrop');
        haptics.trigger('hardDrop');
        lockCurrentPieceAndAdvance();
      }
    },
    [lockCurrentPieceAndAdvance]
  );

  // Subscribe to haptic pulse intensity for HUD icon feedback
  useEffect(() => {
    return haptics.onPulse((_type, intensity) => {
      setHapticPulse(intensity);
      window.setTimeout(() => setHapticPulse(0), 180);
    });
  }, []);

  // Support ?autostart=1 query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startNewRun(0);
    }
  }, [startNewRun]);

  // Global keyboard controls & focus-loss hygiene
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts if typing in Skin Studio input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const currentMode = simRef.current.mode;

      if (currentMode === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startNewRun();
        }
        return;
      }

      if (currentMode === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startNewRun();
        }
        return;
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (currentMode === 'playing') {
          audioEngine.stopLoop();
          updateGameStateMode('paused');
        } else if (currentMode === 'paused') {
          updateGameStateMode('playing');
          audioEngine.startLoop();
        }
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted(audioEngine.toggleMute());
        return;
      }

      if (e.code === 'KeyH') {
        e.preventDefault();
        setHapticsEnabled(haptics.toggle());
        return;
      }

      if (e.code === 'KeyB') {
        e.preventDefault();
        setIsSkinStudioOpen((prev) => !prev);
        return;
      }

      if (e.code === 'KeyK') {
        e.preventDefault();
        handlePetKittens();
        return;
      }

      if (e.code === 'KeyR') {
        e.preventDefault();
        startNewRun();
        return;
      }

      if (currentMode !== 'playing') return;

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          executePlayerAction('left');
          break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          executePlayerAction('right');
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          executePlayerAction('softDrop');
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'KeyX':
          e.preventDefault();
          executePlayerAction('rotateCW');
          break;
        case 'KeyZ':
        case 'KeyQ':
          e.preventDefault();
          executePlayerAction('rotateCCW');
          break;
        case 'Space':
        case 'ShiftLeft':
        case 'ShiftRight':
          e.preventDefault();
          executePlayerAction('hardDrop');
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [executePlayerAction, handlePetKittens, startNewRun, updateGameStateMode]);

  // Main 60Hz Canvas2D Simulation & Render Loop (mounted once, zero teardown)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let lastTimeMs = performance.now();

    const updateCanvasSize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Compute responsive 16x10 board rectangle with side margin for rhythmic light trails
      const topSafe = width < 640 ? 92 : 108;
      const bottomSafe = width < 640 ? 36 : 48;
      const sideSafe = width < 640 ? 22 : 64;

      const availW = Math.max(260, width - sideSafe * 2);
      const availH = Math.max(200, height - topSafe - bottomSafe);

      // Include 2 staging rows above the 10-row grid -> total 12 rows vertical height
      const cellByW = Math.floor(availW / GRID_COLS);
      const cellByH = Math.floor(availH / (GRID_ROWS + 2.2));
      const cellSize = Math.max(16, Math.min(56, Math.min(cellByW, cellByH)));

      const boardW = cellSize * GRID_COLS;
      const boardH = cellSize * GRID_ROWS;
      const boardX = Math.floor((width - boardW) / 2);
      const boardY = Math.floor(topSafe + cellSize * 2.1 + (availH - cellSize * (GRID_ROWS + 2.1)) * 0.45);

      simRef.current.boardRect = {
        x: boardX,
        y: boardY,
        w: boardW,
        h: boardH,
        cellSize,
      };
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(() => updateCanvasSize());
    resizeObserver.observe(document.body);
    window.addEventListener('resize', updateCanvasSize);

    // Helper to draw a Canvas2D 'glint' animation sweeping across a 2x2 matched square module border
    const drawSquareBorderGlint = (
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      squareIndex: number,
      comboCount: number,
      accentHex: string,
      nowMsVal: number
    ) => {
      // Speed scales with active chain multiplier
      const speed = 0.65 + Math.min(4, comboCount - 1) * 0.22;
      const phaseOffset = squareIndex * 0.19;
      const baseProgress = (nowMsVal * 0.001 * speed + phaseOffset) % 1;

      ctx.save();

      // 1. Diagonal Specular Sheen sweeping across the interior of the 2x2 module
      ctx.beginPath();
      ctx.rect(sx + 2, sy + 2, sw - 4, sh - 4);
      ctx.clip();

      const sheenPos = ((baseProgress * 1.8) % 1.6) - 0.3;
      const gx0 = sx + sw * (sheenPos - 0.28);
      const gy0 = sy + sh * (sheenPos - 0.28);
      const gx1 = sx + sw * (sheenPos + 0.28);
      const gy1 = sy + sh * (sheenPos + 0.28);

      const sheenGrad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.32)');
      sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.restore();

      // 2. Twin Opposite Perimeter Glint Ribbons & Starburst Flares along the 2x2 module border
      for (let arm = 0; arm < 2; arm++) {
        const armProgress = (baseProgress + arm * 0.5) % 1;
        const { head, points } = computeSquarePerimeterGlint(
          armProgress,
          sx + 2,
          sy + 2,
          sw - 4,
          sh - 4,
          0.26,
          10
        );

        // Outer chromatic glint ribbon
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = accentHex;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.78;
        ctx.stroke();

        // Inner pure-white specular core
        ctx.beginPath();
        const midStart = Math.floor(points.length * 0.4);
        ctx.moveTo(points[midStart].x, points[midStart].y);
        for (let i = midStart + 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.98;
        ctx.stroke();

        // 4-Point Diamond Specular Star Flare at Glint Head
        const flareRadius = 6 + Math.min(5, (comboCount - 1) * 1.4) + Math.sin(nowMsVal * 0.018) * 1.5;
        ctx.translate(head.x, head.y);
        ctx.rotate((nowMsVal * 0.004) % (Math.PI * 2));

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(0, -flareRadius);
        ctx.quadraticCurveTo(flareRadius * 0.18, -flareRadius * 0.18, flareRadius, 0);
        ctx.quadraticCurveTo(flareRadius * 0.18, flareRadius * 0.18, 0, flareRadius);
        ctx.quadraticCurveTo(-flareRadius * 0.18, flareRadius * 0.18, -flareRadius, 0);
        ctx.quadraticCurveTo(-flareRadius * 0.18, -flareRadius * 0.18, 0, -flareRadius);
        ctx.closePath();
        ctx.fill();

        // Glowing center pip
        ctx.fillStyle = accentHex;
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    };

    const tick = (nowMs: number) => {
      const rawDt = (nowMs - lastTimeMs) / 1000;
      lastTimeMs = nowMs;
      // Clamped dt <= 0.05s per game_title_and_hud.md
      const dt = Math.min(Math.max(0.001, rawDt), 0.05);
      const sim = simRef.current;

      // Decay visual rotation, camera trauma, and screen flash in real dt
      sim.activePiece.visualRotation *= Math.pow(0.0008, dt);
      if (Math.abs(sim.activePiece.visualRotation) < 0.01) {
        sim.activePiece.visualRotation = 0;
      }
      sim.shakeTrauma = Math.max(0, sim.shakeTrauma - dt * 2.4);
      sim.flashAlpha = Math.max(0, sim.flashAlpha - dt * 1.8);
      sim.kittenExcitementTimer = Math.max(0, sim.kittenExcitementTimer - dt);

      const beatPulse = audioEngine.getBeatPulse(nowMs);
      const hudScoreScale = computeBeatHudScale(beatPulse, 0.095);
      if (hudScoreScale !== sim.lastHudBeatScale) {
        sim.lastHudBeatScale = hudScoreScale;
        const hudLevelScale = computeBeatHudScale(beatPulse, 0.08);
        document.documentElement.style.setProperty('--hud-beat-scale', String(hudScoreScale));
        document.documentElement.style.setProperty('--hud-level-beat-scale', String(hudLevelScale));
      }

      // Update pooled particles in real dt
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = sim.particles[i];
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'sparkle') {
          p.vx *= Math.pow(0.28, dt);
          p.vy += -18 * dt; // subtle buoyant lift
          p.rotation += p.vRot * dt;
        } else if (p.kind === 'paw' || p.kind === 'heart') {
          p.vx *= Math.pow(0.4, dt);
          p.vy += -12 * dt; // float gently upward
          p.rotation += p.vRot * dt * 0.4;
        } else if (p.kind === 'fragment') {
          // Shattered block fragments separate crisply and drift away with light air drag
          p.vx *= Math.pow(0.45, dt);
          p.vy += 42 * dt;
          p.rotation += p.vRot * dt;
        } else {
          p.vy += 320 * dt; // subtle gravity arc for burst particles
        }
      }

      // Update floating score popups
      for (let i = 0; i < MAX_POPUPS; i++) {
        const pop = sim.popups[i];
        if (!pop.active) continue;
        pop.life += dt;
        if (pop.life >= pop.maxLife) {
          pop.active = false;
          continue;
        }
        pop.y += pop.vy * dt;
        pop.vy *= Math.pow(0.2, dt);
      }

      // Update & Emit Beat-Synced Background Side Light Trails based on current BPM (beat frequency) and beatPulse
      const trailBeatMetrics = computeLightTrailBeatMetrics(sim.bpm, beatPulse);
      for (let i = 0; i < MAX_LIGHT_TRAILS; i++) {
        const lt = sim.lightTrails[i];
        if (!lt.active) continue;
        lt.life += dt;
        if (lt.life >= lt.maxLife) {
          lt.active = false;
          continue;
        }
        lt.distFromEdge += lt.speed * trailBeatMetrics.speedScale * dt;
        lt.yOffset += lt.vy * trailBeatMetrics.speedScale * dt;
      }

      sim.lightTrailEmitAccum += dt * trailBeatMetrics.emissionRatePerSec;
      while (sim.lightTrailEmitAccum >= 1) {
        sim.lightTrailEmitAccum -= 1;
        spawnSideLightTrail(-1);
        spawnSideLightTrail(1);
      }

      // Advance simulation physics when playing (or ambient timeline sweep on title screen)
      if (sim.mode === 'title') {
        const titleSkin = sim.skins[sim.startingSkinIdx] || BUILTIN_SKINS[0];
        sim.activeSkin = titleSkin;
        const titleSweepSpeed = (titleSkin.bpm / 60) * 2;
        const prevTitleCol = sim.timelineCol;
        const nextTitleCol = (prevTitleCol + titleSweepSpeed * dt) % GRID_COLS;
        sim.timelineCol = nextTitleCol;

        // Emit subtle sparkles when the title showcase sweep bar passes over demo blocks
        const scanColIdx = Math.floor(nextTitleCol) % GRID_COLS;
        const crossedEdge = Math.floor(prevTitleCol) !== Math.floor(nextTitleCol);
        sim.sparkleEmitAccum += dt * (26 + beatPulse * 16);
        const shouldEmitGlide = sim.sparkleEmitAccum >= 1;
        if (shouldEmitGlide) {
          sim.sparkleEmitAccum = 0;
        }
        if (crossedEdge || shouldEmitGlide) {
          const { x: rawBx, y: rawBy, cellSize: rawCellSize } = sim.boardRect;
          const barX = rawBx + nextTitleCol * rawCellSize;
          const demoCols = new Map<number, [number, 1 | 2, boolean][]>([
            [2, [[8, 1, true], [9, 1, true]]],
            [3, [[8, 1, true], [9, 1, true]]],
            [6, [[8, 2, true], [9, 2, true]]],
            [7, [[8, 2, true], [9, 2, true]]],
            [10, [[7, 1, false], [8, 2, false], [9, 1, false]]],
            [12, [[8, 1, true], [9, 1, true]]],
            [13, [[8, 1, true], [9, 1, true]]],
          ]);
          const rowsAtCol = demoCols.get(scanColIdx);
          if (rowsAtCol) {
            for (const [r, colId, isMatched] of rowsAtCol) {
              const py = rawBy + (r + 0.18 + Math.random() * 0.64) * rawCellSize;
              const baseColor =
                colId === 1 ? titleSkin.color1Fill : titleSkin.color2Fill;
              const sparkleColor =
                isMatched && Math.random() < 0.55
                  ? titleSkin.timelineAccent
                  : Math.random() < 0.3
                  ? '#FFFFFF'
                  : baseColor;
              spawnSweepSparkle(
                barX,
                py,
                sparkleColor,
                isMatched,
                beatPulse,
                crossedEdge ? 2 : 1
              );
            }
          }
        }
      } else if (sim.mode === 'playing') {
        if (sim.hitstopTimer > 0) {
          sim.hitstopTimer = Math.max(0, sim.hitstopTimer - dt);
        } else {
          // 1. Advance active piece gravity
          sim.gravityTimer += dt;
          sim.activePiece.fallProgress = Math.min(
            1,
            sim.gravityTimer / Math.max(0.08, sim.gravityIntervalSec)
          );

          if (sim.gravityTimer >= sim.gravityIntervalSec) {
            sim.gravityTimer = 0;
            if (canPieceOccupy(sim.board, sim.activePiece.col, sim.activePiece.row + 1)) {
              sim.activePiece.row += 1;
              sim.activePiece.fallProgress = 0;
            } else {
              lockCurrentPieceAndAdvance();
            }
          }

          // 2. Advance Beat-Synced Timeline Sweep Bar
          const prevCol = sim.timelineCol;
          const rawNextCol = prevCol + sim.sweepColsPerSec * dt;
          const nextCol = rawNextCol >= GRID_COLS ? rawNextCol - GRID_COLS : rawNextCol;
          sim.timelineCol = nextCol;

          // Detect blocks underneath the sweep bar BEFORE erasure so passing over any settled or swept block emits sparkles
          const blockContacts = findSweepBarBlockContacts(sim.board, prevCol, nextCol);
          if (blockContacts.length > 0) {
            sim.sparkleEmitAccum += dt * (28 + beatPulse * 18);
            const emitContinuous = sim.sparkleEmitAccum >= 1;
            if (emitContinuous) {
              sim.sparkleEmitAccum = 0;
            }
            const { x: bx, y: by, cellSize } = sim.boardRect;
            const barX = bx + nextCol * cellSize;
            for (const contact of blockContacts) {
              if (contact.crossedLeadingEdge || emitContinuous) {
                const py = by + (contact.row + 0.18 + Math.random() * 0.64) * cellSize;
                const blockHex =
                  contact.color === 1 ? sim.activeSkin.color1Fill : sim.activeSkin.color2Fill;
                const sparkleColor =
                  contact.isMatched && Math.random() < 0.55
                    ? sim.activeSkin.timelineAccent
                    : Math.random() < 0.32
                    ? '#FFFFFF'
                    : blockHex;
                spawnSweepSparkle(
                  barX,
                  py,
                  sparkleColor,
                  contact.isMatched,
                  beatPulse,
                  contact.crossedLeadingEdge ? 2 : 1
                );
              }
            }
          }

          const sweepStep = stepTimelineSweep(sim.board, prevCol, nextCol, sim.combo);
          sim.board = sweepStep.board;
          sim.squares = sweepStep.squares;

          if (sweepStep.newlySweptSquares > 0) {
            haptics.trigger('sweepTick');
          }

          const currentSweptPending = sim.squares.filter((sq) => sq.swept).length;
          setHudSweptPending((prev) => (prev !== currentSweptPending ? currentSweptPending : prev));

          if (sweepStep.clearedSquaresThisStep > 0) {
            // Hitstop + Block Shatter Fragment Drift + Particle Burst + Score Popup + Audio Chord + Haptics!
            const clearedSq = sweepStep.clearedSquaresThisStep;
            sim.clearedInCurrentPass = true;
            sim.combo = sim.combo + 1;
            sim.maxCombo = Math.max(sim.maxCombo, sim.combo);
            sim.score += sweepStep.scoreDelta;
            sim.clearedSquares += clearedSq;
            sim.hitstopTimer = clearedSq >= 3 ? 0.065 : 0.038;
            sim.shakeTrauma = Math.min(1, sim.shakeTrauma + 0.25 + clearedSq * 0.08);
            sim.flashAlpha = Math.min(0.45, 0.15 + clearedSq * 0.06);

            // Shatter every cleared block in the cleared row(s) into smaller geometric fragments that drift away
            if (sweepStep.clearedCells.length > 0) {
              spawnBlockShatterFragments(sweepStep.clearedCells);
            }
            sim.kittenExcitementTimer = 1.45;

            // Spawn accent particles + kitten hearts/paws along the timeline sweep bar
            const { x: bx, y: by, w: bw, h: bh, cellSize } = sim.boardRect;
            const barX = bx + (sweepStep.wrappedAround ? GRID_COLS : nextCol) * cellSize;
            spawnKittenLoveParticles(bx + bw - 68, by - 18, sim.activeSkin.timelineAccent, 6);
            for (let k = 0; k < Math.min(4, clearedSq + 1); k++) {
              const py = by + bh * (0.2 + 0.15 * k);
              spawnParticles(
                barX,
                py,
                k % 2 === 0 ? sim.activeSkin.color1Fill : sim.activeSkin.timelineAccent,
                10,
                1.15
              );
            }

            const bonusLabel = sweepStep.allClearBonus
              ? 'PERFECT CLEAR +5000!'
              : sweepStep.uniColorBonus
              ? 'UNI-COLOR BONUS +1500!'
              : `${clearedSq} SQ SWEEP · ${sim.combo}× CHAIN`;

            spawnPopup(
              barX,
              by + bh * 0.35,
              `+${sweepStep.scoreDelta.toLocaleString()}`,
              bonusLabel,
              sim.activeSkin.timelineAccent
            );

            audioEngine.playActionSfx('sweepClear', sim.combo + clearedSq);
            haptics.trigger('sweepClear', sim.combo);

            // Check progression for level & skin transitions
            const orderedSkins = [
              ...sim.skins.slice(sim.startingSkinIdx),
              ...sim.skins.slice(0, sim.startingSkinIdx),
            ];
            const prog = calculateProgression(sim.clearedSquares, orderedSkins);
            const skinChanged = prog.skin.id !== sim.activeSkin.id;

            sim.level = prog.level;
            sim.activeSkin = prog.skin;
            sim.bpm = prog.bpm;
            sim.gravityIntervalSec = prog.gravityRowIntervalSec;
            sim.sweepColsPerSec = prog.sweepColsPerSec;

            audioEngine.setSkinAndBpm(prog.skin, prog.bpm);

            if (skinChanged) {
              audioEngine.playActionSfx('skinChange');
              haptics.trigger('skinChange');
              sim.flashAlpha = 0.45;
              showBanner(`STAGE SKIN UNLOCKED · ${prog.skin.name} (${prog.bpm} BPM)`, 2600);
            } else if (sweepStep.allClearBonus || sweepStep.uniColorBonus || clearedSq >= 4) {
              showBanner(bonusLabel, 1800);
            }

            setHudScore(sim.score);
            setHudSquares(sim.clearedSquares);
            setHudCombo(sim.combo);
            setHudLevel(prog.level);
            setHudBpm(prog.bpm);
            setHudSkin(prog.skin);

            if (sim.score > sim.highScore) {
              sim.highScore = sim.score;
              setHudHighScore(sim.highScore);
              try {
                localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(sim.highScore));
              } catch {
                // Ignore
              }
            }
          }

          if (sweepStep.wrappedAround) {
            if (!sim.clearedInCurrentPass && sweepStep.clearedSquaresThisStep === 0) {
              sim.combo = 1;
              setHudCombo(1);
            }
            sim.clearedInCurrentPass = false;
          }
        }
      }

      // ======================== RENDER FRAME ========================
      const width = window.innerWidth;
      const height = window.innerHeight;
      const skin = sim.activeSkin;

      // 1. Canvas Background Fill
      ctx.fillStyle = skin.bgCanvas;
      ctx.fillRect(0, 0, width, height);

      // 2. Optional Custom Backdrop Image (from Gemini Skin Studio or Procedural Synth)
      if (skin.customBackdropUrl) {
        let img = backdropImagesRef.current.get(skin.customBackdropUrl);
        if (!img) {
          img = new Image();
          img.src = skin.customBackdropUrl;
          backdropImagesRef.current.set(skin.customBackdropUrl, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = 0.28 + beatPulse * 0.08;
          ctx.drawImage(img, 0, 0, width, height);
          ctx.restore();
        }
      }

      // 3. Ambient Beat-Reactive Equalizer Bars in Background Negative Space
      ctx.save();
      const bgBarCount = 32;
      const bgBarW = width / bgBarCount;
      for (let i = 0; i < bgBarCount; i++) {
        const wave =
          Math.sin(nowMs * 0.003 + i * 0.45) * 0.5 +
          Math.cos(nowMs * 0.005 - i * 0.25) * 0.5;
        const barH = (0.06 + Math.abs(wave) * 0.16 + beatPulse * 0.07) * height;
        ctx.fillStyle = i % 2 === 0 ? skin.color1Fill : skin.color2Fill;
        ctx.globalAlpha = 0.055 + beatPulse * 0.035;
        ctx.fillRect(i * bgBarW + 2, height - barH, bgBarW - 4, bgBarW > 6 ? barH : barH);
      }
      ctx.restore();

      // 4. Camera Shake Offset (`trauma * trauma`)
      ctx.save();
      const shakeMag = sim.shakeTrauma * sim.shakeTrauma * 12;
      const shakeX = shakeMag > 0.1 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
      const shakeY = shakeMag > 0.1 ? (Math.random() - 0.5) * 2 * shakeMag : 0;

      // On Title Screen, place the showcase board cleanly in the right half on desktop for negative-space composition
      const { x: rawBx, y: rawBy, cellSize: rawCellSize } = sim.boardRect;
      const isDesktopTitle = sim.mode === 'title' && width >= 1024;
      const cellSize = isDesktopTitle ? Math.floor(rawCellSize * 0.88) : rawCellSize;
      const bw = cellSize * GRID_COLS;
      const bh = cellSize * GRID_ROWS;
      const bx =
        (isDesktopTitle ? Math.floor(width * 0.56 - bw * 0.25) : rawBx) + shakeX;
      const by =
        (isDesktopTitle ? Math.floor((height - bh) / 2) : rawBy) + shakeY;
      const titleOffsetX = isDesktopTitle ? bx - rawBx : 0;

      // 4b. Background Side 'Light Trails' Emitting from Left & Right Edges of the Board
      // Pulsate and grow in length, thickness, and intensity based on current beat frequency (sim.bpm) & beatPulse
      ctx.save();
      for (let sideVal of [-1, 1] as const) {
        const edgeX = sideVal === -1 ? bx - 2 : bx + bw + 2;
        const railGrad = ctx.createLinearGradient(edgeX, by, edgeX, by + bh);
        railGrad.addColorStop(0, `${skin.color1Fill}00`);
        railGrad.addColorStop(0.25, sideVal === -1 ? skin.color1Fill : skin.color2Fill);
        railGrad.addColorStop(0.5, skin.timelineAccent);
        railGrad.addColorStop(0.75, sideVal === -1 ? skin.color2Fill : skin.color1Fill);
        railGrad.addColorStop(1, `${skin.color2Fill}00`);

        ctx.strokeStyle = railGrad;
        ctx.lineWidth = 2 + beatPulse * 3.2;
        ctx.globalAlpha = 0.45 + beatPulse * 0.4;
        ctx.beginPath();
        ctx.moveTo(edgeX, by - 6);
        ctx.lineTo(edgeX, by + bh + 6);
        ctx.stroke();
      }

      for (let i = 0; i < MAX_LIGHT_TRAILS; i++) {
        const lt = sim.lightTrails[i];
        if (!lt.active) continue;

        const lifeRatio = lt.life / lt.maxLife;
        const fade = Math.sin(Math.min(1, lifeRatio * 3.2) * (Math.PI / 2)) * (1 - Math.pow(lifeRatio, 1.45));
        if (fade <= 0.02) continue;

        // Length & thickness pulsate and grow with current beat frequency (BPM) and beatPulse
        const freqOsc =
          0.78 +
          0.22 *
            Math.sin(nowMs * 0.008 * trailBeatMetrics.beatFreqHz + lt.wavePhase);
        const liveLen = lt.baseLength * trailBeatMetrics.trailLengthScale * freqOsc;
        const liveThick = Math.max(
          1.6,
          (lt.thickness * 0.55 + trailBeatMetrics.trailThickness * 0.55) *
            (1 - lifeRatio * 0.3)
        );

        const originX = lt.side === -1 ? bx : bx + bw;
        const originY = by + lt.rowNorm * bh;

        const headDist = lt.distFromEdge;
        const tailDist = Math.max(0, headDist - liveLen);

        const waveY =
          Math.sin(nowMs * 0.006 * trailBeatMetrics.beatFreqHz + lt.wavePhase) *
          (7 + beatPulse * 11);

        const headX = originX + lt.side * headDist;
        const headY = originY + lt.yOffset + waveY;

        const tailRatio = headDist > 0.1 ? tailDist / headDist : 0;
        const tailX = originX + lt.side * tailDist;
        const tailY = originY + lt.yOffset * tailRatio + waveY * tailRatio * 0.4;

        const ctrlX = (tailX + headX) * 0.5;
        const ctrlY =
          (tailY + headY) * 0.5 +
          Math.cos(nowMs * 0.007 * trailBeatMetrics.beatFreqHz + lt.wavePhase) *
            (6 + beatPulse * 8);

        // 1. Soft outer chromatic aura ribbon
        ctx.save();
        ctx.strokeStyle = lt.color;
        ctx.lineWidth = liveThick * 2.7;
        ctx.lineCap = 'round';
        ctx.globalAlpha = Math.max(0, fade * (0.24 + beatPulse * 0.24));
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, headX, headY);
        ctx.stroke();

        // 2. Core multi-stop gradient light trail ribbon
        const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        grad.addColorStop(0, `${lt.color}00`);
        grad.addColorStop(0.45, lt.color);
        grad.addColorStop(0.82, lt.accentColor);
        grad.addColorStop(1, '#FFFFFF');

        ctx.strokeStyle = grad;
        ctx.lineWidth = liveThick;
        ctx.globalAlpha = Math.max(0, fade * (0.76 + beatPulse * 0.22));
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, headX, headY);
        ctx.stroke();

        // 3. Pulsating luminous head node at tip of light trail
        const headRadius = liveThick * (0.85 + beatPulse * 0.45);
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = Math.max(0, fade * 0.92);
        ctx.beginPath();
        ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
      ctx.restore();

      // 5. Board Outer Frame & Beat-Synced Perimeter Glow
      ctx.fillStyle = skin.gridSurface;
      ctx.fillRect(bx, by, bw, bh);

      ctx.strokeStyle = skin.color1Fill;
      ctx.globalAlpha = 0.22 + beatPulse * 0.25;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.globalAlpha = 1;

      // 6. 16x10 Grid Hairlines & Column Beat Markers
      ctx.lineWidth = 1;
      for (let c = 0; c <= GRID_COLS; c++) {
        const gx = bx + c * cellSize;
        ctx.strokeStyle = c % 4 === 0 ? 'rgba(255, 255, 255, 0.16)' : skin.gridLine;
        ctx.beginPath();
        ctx.moveTo(gx, by);
        ctx.lineTo(gx, by + bh);
        ctx.stroke();
      }
      for (let r = 0; r <= GRID_ROWS; r++) {
        const gy = by + r * cellSize;
        ctx.strokeStyle = r === 0 ? 'rgba(255, 255, 255, 0.24)' : skin.gridLine;
        ctx.beginPath();
        ctx.moveTo(bx, gy);
        ctx.lineTo(bx + bw, gy);
        ctx.stroke();
      }

      // Helper to draw an individual Lumines cell with crisp minimalist geometry
      const drawLuminesCell = (
        px: number,
        py: number,
        size: number,
        colorId: 1 | 2,
        isSpecial = false,
        isMatched = false,
        isSwept = false,
        alpha = 1
      ) => {
        const fill = colorId === 1 ? skin.color1Fill : skin.color2Fill;
        const inner = colorId === 1 ? skin.color1Inner : skin.color2Inner;
        const border = colorId === 1 ? skin.color1Border : skin.color2Border;
        const pad = Math.max(1.5, size * 0.06);

        ctx.save();
        ctx.globalAlpha = alpha;

        // Base tile
        ctx.fillStyle = isSwept ? '#FFFFFF' : fill;
        ctx.fillRect(px + pad, py + pad, size - pad * 2, size - pad * 2);

        // Crisp inner bevel square
        const innerPad = Math.max(4, size * 0.22);
        ctx.fillStyle = isSwept ? fill : inner;
        ctx.globalAlpha = alpha * (isMatched ? 0.92 : 0.55);
        ctx.fillRect(
          px + innerPad,
          py + innerPad,
          size - innerPad * 2,
          size - innerPad * 2
        );

        // Border stroke
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = isMatched ? '#FFFFFF' : border;
        ctx.lineWidth = isMatched ? 2 : 1;
        ctx.strokeRect(px + pad, py + pad, size - pad * 2, size - pad * 2);

        // Minimalist Cat & Kitten Motif inside every cell (Color 1 = Cat Head Silhouette, Color 2 = Toe-Bean Paw Print)
        if (!isSpecial && size >= 18) {
          const cx = px + size * 0.5;
          const cy = py + size * 0.52;
          ctx.save();
          ctx.fillStyle = isSwept ? fill : '#05070E';
          ctx.globalAlpha = alpha * (isMatched ? 0.34 : 0.24);

          if (colorId === 1) {
            // Cute minimalist cat face with pointed ears
            const r = size * 0.19;
            ctx.beginPath();
            ctx.arc(cx, cy + r * 0.12, r, 0, Math.PI * 2);
            ctx.fill();
            // Left ear
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.95, cy - r * 0.1);
            ctx.lineTo(cx - r * 0.72, cy - r * 1.15);
            ctx.lineTo(cx - r * 0.15, cy - r * 0.55);
            ctx.closePath();
            ctx.fill();
            // Right ear
            ctx.beginPath();
            ctx.moveTo(cx + r * 0.95, cy - r * 0.1);
            ctx.lineTo(cx + r * 0.72, cy - r * 1.15);
            ctx.lineTo(cx + r * 0.15, cy - r * 0.55);
            ctx.closePath();
            ctx.fill();
          } else {
            // Cute 4-toe-bean kitten paw print
            const padR = size * 0.12;
            ctx.beginPath();
            ctx.ellipse(cx, cy + padR * 0.55, padR * 1.2, padR * 0.95, 0, 0, Math.PI * 2);
            ctx.fill();
            const beanR = size * 0.052;
            const beanOffsets: [number, number][] = [
              [-padR * 1.15, -padR * 0.45],
              [-padR * 0.4, -padR * 1.05],
              [padR * 0.4, -padR * 1.05],
              [padR * 1.15, -padR * 0.45],
            ];
            for (const [bxOff, byOff] of beanOffsets) {
              ctx.beginPath();
              ctx.arc(cx + bxOff, cy + byOff, beanR, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }

        // Special Chain Gem reticle in center
        if (isSpecial) {
          const cx = px + size / 2;
          const cy = py + size / 2;
          const r = size * 0.22;
          ctx.fillStyle = '#05070E';
          ctx.beginPath();
          ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      };

      // 7. Render Title Screen Showcase Demo Blocks OR Live Settled Board Blocks
      if (sim.mode === 'title') {
        // Draw an artistic live pattern of blocks on the showcase grid
        const demoPattern: [number, number, 1 | 2, boolean][] = [
          [8, 2, 1, true],
          [8, 3, 1, true],
          [9, 2, 1, true],
          [9, 3, 1, true],
          [8, 6, 2, true],
          [8, 7, 2, true],
          [9, 6, 2, true],
          [9, 7, 2, true],
          [7, 10, 1, false],
          [8, 10, 2, false],
          [9, 10, 1, false],
          [8, 12, 1, true],
          [8, 13, 1, true],
          [9, 12, 1, true],
          [9, 13, 1, true],
        ];
        for (const [r, c, colId, matched] of demoPattern) {
          const swept = matched && sim.timelineCol >= c + 2;
          drawLuminesCell(
            bx + c * cellSize,
            by + r * cellSize,
            cellSize,
            colId,
            false,
            matched,
            swept,
            0.85
          );
        }
        // Showcase the active chain glint effect on the Title Screen demo squares
        const demoSquares: [number, number][] = [
          [8, 2],
          [8, 6],
          [8, 12],
        ];
        demoSquares.forEach(([r, c], idx) => {
          drawSquareBorderGlint(
            bx + c * cellSize,
            by + r * cellSize,
            cellSize * 2,
            cellSize * 2,
            idx,
            3,
            skin.timelineAccent,
            nowMs
          );
        });
      } else {
        // Render settled board cells
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            const cell = sim.board[r][c];
            if (!cell) continue;
            drawLuminesCell(
              bx + c * cellSize,
              by + r * cellSize,
              cellSize,
              cell.color,
              Boolean(cell.isSpecial),
              Boolean(cell.isMatched),
              Boolean(cell.isSwept),
              1
            );
          }
        }

        // 8. Highlight Fused 2x2 Matched Square Modules with Luminous Framing & Active Chain Glint
        sim.squares.forEach((sq, sqIdx) => {
          const sx = bx + sq.col * cellSize;
          const sy = by + sq.row * cellSize;
          const sw = cellSize * 2;
          const sh = cellSize * 2;

          ctx.save();
          ctx.strokeStyle = sq.swept ? skin.timelineAccent : '#FFFFFF';
          ctx.lineWidth = sq.swept ? 3.5 : 2.5;
          ctx.globalAlpha = 0.8 + beatPulse * 0.2;
          ctx.strokeRect(sx + 2, sy + 2, sw - 4, sh - 4);
          ctx.restore();

          // Sweeping Canvas2D 'glint' animation across the 2x2 square border whenever a chain multiplier is active (combo > 1)
          if (sim.combo > 1) {
            drawSquareBorderGlint(
              sx,
              sy,
              sw,
              sh,
              sqIdx,
              sim.combo,
              sq.swept ? '#FFFFFF' : skin.timelineAccent,
              nowMs
            );
          }
        });

        // 9. Render Split-Column Ghost Drop Preview + Active Falling 2x2 Piece
        const piece = sim.activePiece;
        // Draw column drop guide rails & ghost landing silhouettes for each column
        for (let cOff = 0; cOff < 2; cOff++) {
          const col = piece.col + cOff;
          if (col < 0 || col >= GRID_COLS) continue;
          let landingRow = GRID_ROWS - 1;
          while (landingRow >= 0 && sim.board[landingRow][col] !== null) {
            landingRow--;
          }
          // Ghost cells for rOff = 1 (bottom) and rOff = 0 (top)
          for (let rOff = 1; rOff >= 0; rOff--) {
            const ghostRow = landingRow - (1 - rOff);
            if (ghostRow >= 0 && ghostRow < GRID_ROWS) {
              const gCell = piece.cells[rOff][cOff];
              drawLuminesCell(
                bx + col * cellSize,
                by + ghostRow * cellSize,
                cellSize,
                gCell.color,
                Boolean(gCell.isSpecial),
                false,
                false,
                0.22
              );
            }
          }
        }

        // Draw Active Piece (with smooth visual rotation & staging rail above row 0)
        const pieceCenterX = bx + (piece.col + 1) * cellSize;
        const smoothRow = piece.row + piece.fallProgress * 0.25;
        const pieceCenterY = by + (smoothRow + 1) * cellSize;

        ctx.save();
        ctx.translate(pieceCenterX, pieceCenterY);
        if (piece.visualRotation !== 0) {
          ctx.rotate(piece.visualRotation);
        }
        for (let rOff = 0; rOff < 2; rOff++) {
          for (let cOff = 0; cOff < 2; cOff++) {
            const cell = piece.cells[rOff][cOff];
            const localX = (cOff - 1) * cellSize;
            const localY = (rOff - 1) * cellSize;
            drawLuminesCell(
              localX,
              localY,
              cellSize,
              cell.color,
              Boolean(cell.isSpecial),
              false,
              false,
              1
            );
          }
        }
        ctx.restore();
      }

      // 9b. Adorable Beat-Dancing DJ Cat & Kitten Crew Perched Along the Top of the Board Frame
      const drawCatCompanion = (
        anchorX: number,
        anchorY: number,
        baseRadius: number,
        kittenIdx: number,
        coatColor: string,
        patchColor: string | null,
        earInnerColor: string,
        hasHeadphones: boolean
      ) => {
        const dance = computeKittenBeatDance(
          nowMs,
          sim.bpm,
          beatPulse,
          kittenIdx,
          sim.kittenExcitementTimer
        );
        const isBlinking = (nowMs + kittenIdx * 430) % 3600 < 140;

        ctx.save();
        ctx.translate(anchorX, anchorY + dance.bounceY);
        ctx.scale(dance.scaleX, dance.scaleY);

        // Wagging tail behind body
        ctx.save();
        ctx.translate(kittenIdx === 0 ? -baseRadius * 0.75 : baseRadius * 0.75, -baseRadius * 0.25);
        ctx.rotate(dance.tailAngle + (kittenIdx === 0 ? -0.45 : 0.45));
        ctx.strokeStyle = coatColor;
        ctx.lineWidth = Math.max(3, baseRadius * 0.32);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          (kittenIdx === 0 ? -1 : 1) * baseRadius * 0.9,
          -baseRadius * 0.7,
          (kittenIdx === 0 ? -1 : 1) * baseRadius * 0.45,
          -baseRadius * 1.35
        );
        ctx.stroke();
        ctx.restore();

        // Chubby round cat head/body silhouette
        ctx.fillStyle = coatColor;
        ctx.strokeStyle = '#05070E';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -baseRadius * 0.78, baseRadius * 1.05, baseRadius * 0.92, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Optional calico/tuxedo forehead patch
        if (patchColor) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(0, -baseRadius * 0.78, baseRadius * 1.02, baseRadius * 0.89, 0, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = patchColor;
          ctx.beginPath();
          ctx.arc(baseRadius * 0.48, -baseRadius * 1.25, baseRadius * 0.68, 0, Math.PI * 2);
          ctx.fill();
          if (kittenIdx === 1) {
            // Calico second warm spot
            ctx.fillStyle = '#FB923C';
            ctx.beginPath();
            ctx.arc(-baseRadius * 0.52, -baseRadius * 1.2, baseRadius * 0.55, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Left & Right Twitching Cat Ears
        for (const side of [-1, 1] as const) {
          ctx.save();
          ctx.translate(side * baseRadius * 0.62, -baseRadius * 1.42);
          ctx.rotate(side * dance.earAngle);

          ctx.fillStyle = coatColor;
          ctx.strokeStyle = '#05070E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-side * baseRadius * 0.34, baseRadius * 0.22);
          ctx.lineTo(side * baseRadius * 0.18, -baseRadius * 0.58);
          ctx.lineTo(side * baseRadius * 0.42, baseRadius * 0.34);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Pink inner ear triangle
          ctx.fillStyle = earInnerColor;
          ctx.beginPath();
          ctx.moveTo(-side * baseRadius * 0.16, baseRadius * 0.16);
          ctx.lineTo(side * baseRadius * 0.14, -baseRadius * 0.34);
          ctx.lineTo(side * baseRadius * 0.28, baseRadius * 0.24);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Glowing Neon DJ Headphones on DJ Whiskers (kittenIdx === 0)
        if (hasHeadphones) {
          ctx.save();
          ctx.strokeStyle = skin.timelineAccent;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.arc(0, -baseRadius * 0.85, baseRadius * 1.16, Math.PI * 1.12, Math.PI * 1.88);
          ctx.stroke();

          for (const side of [-1, 1] as const) {
            ctx.fillStyle = skin.color1Fill;
            ctx.strokeStyle = '#05070E';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.ellipse(
              side * baseRadius * 1.08,
              -baseRadius * 0.76,
              baseRadius * 0.24,
              baseRadius * 0.38,
              0,
              0,
              Math.PI * 2
            );
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }

        // Expressive Eyes (Happy '^ ^' arcs when cheering/combo, otherwise sparkling anime kitten eyes)
        const eyeY = -baseRadius * 0.82;
        const eyeX = baseRadius * 0.42;
        if (dance.isCheering || sim.combo > 1 || isBlinking) {
          ctx.strokeStyle = '#0F172A';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          for (const side of [-1, 1] as const) {
            ctx.beginPath();
            ctx.arc(side * eyeX, eyeY + 1, baseRadius * 0.19, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          }
        } else {
          for (const side of [-1, 1] as const) {
            ctx.fillStyle = '#0F172A';
            ctx.beginPath();
            ctx.arc(side * eyeX, eyeY, baseRadius * 0.2, 0, Math.PI * 2);
            ctx.fill();
            // White kawaii eye shine
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(side * eyeX - 1.2, eyeY - 1.2, baseRadius * 0.08, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Rosy Cheeks
        ctx.fillStyle = '#FF7EB6';
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.ellipse(-baseRadius * 0.62, eyeY + baseRadius * 0.22, baseRadius * 0.18, baseRadius * 0.1, 0, 0, Math.PI * 2);
        ctx.ellipse(baseRadius * 0.62, eyeY + baseRadius * 0.22, baseRadius * 0.18, baseRadius * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Cute Pink Triangle Nose & 'w' Cat Mouth
        const noseY = -baseRadius * 0.62;
        ctx.fillStyle = '#FB7185';
        ctx.beginPath();
        ctx.moveTo(-2.2, noseY - 1.5);
        ctx.lineTo(2.2, noseY - 1.5);
        ctx.lineTo(0, noseY + 1.5);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(-2.2, noseY + 2, 2.2, 0, Math.PI * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(2.2, noseY + 2, 2.2, Math.PI * 0.1, Math.PI);
        ctx.stroke();

        // Whiskers
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 1.1;
        for (const side of [-1, 1] as const) {
          ctx.beginPath();
          ctx.moveTo(side * baseRadius * 0.72, noseY - 1);
          ctx.lineTo(side * baseRadius * 1.28, noseY - 3);
          ctx.moveTo(side * baseRadius * 0.72, noseY + 2);
          ctx.lineTo(side * baseRadius * 1.28, noseY + 3.5);
          ctx.stroke();
        }

        // Little Front Paws Resting & Bobbing on the Top Frame Rail
        const pawBob = Math.sin(nowMs * 0.012 + kittenIdx) * (1.2 + beatPulse * 2);
        for (const side of [-1, 1] as const) {
          ctx.fillStyle = patchColor && kittenIdx === 2 ? '#FFFFFF' : coatColor;
          ctx.strokeStyle = '#05070E';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(
            side * baseRadius * 0.46,
            2 + (side === 1 ? pawBob : -pawBob),
            baseRadius * 0.25,
            baseRadius * 0.19,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
      };

      const catScale = Math.max(0.76, Math.min(1.18, cellSize / 34));
      // Left Corner Perch: DJ Whiskers (White Cream Cat with Neon Headphones)
      drawCatCompanion(
        bx + Math.max(26, cellSize * 1.15),
        by - 2,
        13.5 * catScale,
        0,
        '#F8FAFC',
        null,
        '#FDA4AF',
        true
      );
      // Right Corner Perch: The Kitten Crew (Mochi the Calico, Boba the Tuxedo, Yuzu the Orange Tabby)
      drawCatCompanion(
        bx + bw - Math.max(78, cellSize * 2.75),
        by - 2,
        10.5 * catScale,
        1,
        '#FFFBEB',
        '#334155',
        '#FDA4AF',
        false
      );
      drawCatCompanion(
        bx + bw - Math.max(50, cellSize * 1.75),
        by - 2,
        11 * catScale,
        2,
        '#334155',
        '#F8FAFC',
        '#F472B6',
        false
      );
      drawCatCompanion(
        bx + bw - Math.max(22, cellSize * 0.8),
        by - 2,
        10 * catScale,
        3,
        '#FDBA74',
        '#EA580C',
        '#FDA4AF',
        false
      );

      // 10. Render Beat-Synced Timeline Sweep Bar
      const sweepX = bx + sim.timelineCol * cellSize;
      const trailWidth = cellSize * 1.65;
      const trailGrad = ctx.createLinearGradient(sweepX - trailWidth, by, sweepX, by);
      trailGrad.addColorStop(0, 'rgba(255, 230, 0, 0)');
      trailGrad.addColorStop(1, `${skin.timelineAccent}44`);
      ctx.fillStyle = trailGrad;
      ctx.fillRect(Math.max(bx, sweepX - trailWidth), by, Math.min(trailWidth, sweepX - bx), bh);

      // Crisp Timeline Scanner Beam
      ctx.fillStyle = skin.timelineAccent;
      ctx.fillRect(sweepX - 2, by - 8, 4, bh + 16);

      // Subtle rhythm-synced scanner contact shimmer nodes where the sweep bar intersects blocks
      const activeScanCol = Math.floor(sim.timelineCol) % GRID_COLS;
      if (sim.mode !== 'title') {
        for (let r = 0; r < GRID_ROWS; r++) {
          const scannedCell = sim.board[r][activeScanCol];
          if (!scannedCell) continue;
          const nodeY = by + (r + 0.5) * cellSize;
          const nodeR = 3.2 + beatPulse * 2.2;
          ctx.save();
          ctx.fillStyle = '#FFFFFF';
          ctx.globalAlpha = 0.72 + beatPulse * 0.25;
          ctx.fillRect(sweepX - 1.5, by + r * cellSize + 2, 3, cellSize - 4);
          ctx.beginPath();
          ctx.arc(sweepX, nodeY, nodeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Cat-Eared Scanner Head Flag with live BPM / Sweep Counter
      ctx.fillStyle = skin.timelineAccent;
      // Pointed left & right cat ears on the scanner flag
      ctx.beginPath();
      ctx.moveTo(sweepX - 20, by - 23);
      ctx.lineTo(sweepX - 15, by - 31 - beatPulse * 2);
      ctx.lineTo(sweepX - 8, by - 23);
      ctx.moveTo(sweepX + 8, by - 23);
      ctx.lineTo(sweepX + 15, by - 31 - beatPulse * 2);
      ctx.lineTo(sweepX + 20, by - 23);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(sweepX - 22, by - 24, 44, 18, 5);
      ctx.fill();

      ctx.fillStyle = '#05070E';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sweptNow = sim.squares.filter((s) => s.swept).length;
      ctx.fillText(sweptNow > 0 ? `${sweptNow} SQ` : `${sim.bpm}`, sweepX, by - 15);

      // 11. Render Pooled Particles (Burst Cubes, Sweep-Bar Star Sparkles, and Shattered Block Fragments)
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = sim.particles[i];
        if (!p.active) continue;
        const lifeRatio = p.life / p.maxLife;
        const baseAlpha = 1 - lifeRatio;

        if (p.kind === 'sparkle') {
          const twinkle =
            0.62 + 0.38 * Math.sin(nowMs * 0.026 + p.twinklePhase + beatPulse * 2.2);
          const r = p.size * (1 - lifeRatio * 0.35) * (0.88 + beatPulse * 0.2);
          const px = p.x + titleOffsetX;
          const py = p.y;

          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, baseAlpha * twinkle * 0.92));
          ctx.translate(px, py);
          ctx.rotate(p.rotation);

          // Outer 4-point diamond star sparkle in block/accent color
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.quadraticCurveTo(r * 0.18, -r * 0.18, r, 0);
          ctx.quadraticCurveTo(r * 0.18, r * 0.18, 0, r);
          ctx.quadraticCurveTo(-r * 0.18, r * 0.18, -r, 0);
          ctx.quadraticCurveTo(-r * 0.18, -r * 0.18, 0, -r);
          ctx.closePath();
          ctx.fill();

          // Crisp pure-white specular pinpoint core
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0.9, r * 0.28), 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (p.kind === 'fragment') {
          // Miniature shattered block shard with bevel inner highlight and fracture border drifting away
          const fragScale = 1 - Math.pow(lifeRatio, 1.5) * 0.52;
          const s = Math.max(2, p.size * fragScale);
          const half = s * 0.5;
          const innerHalf = s * 0.26;
          const fragAlpha = 1 - Math.pow(lifeRatio, 1.35);

          ctx.save();
          ctx.globalAlpha = Math.max(0, fragAlpha);
          ctx.translate(p.x + titleOffsetX, p.y);
          ctx.rotate(p.rotation);

          // Primary shattered tile body
          ctx.fillStyle = p.color;
          ctx.fillRect(-half, -half, s, s);

          // Inner bevel shard core
          ctx.fillStyle = p.secondaryColor;
          ctx.globalAlpha = Math.max(0, fragAlpha * 0.85);
          ctx.fillRect(-innerHalf, -innerHalf, innerHalf * 2, innerHalf * 2);

          // Specular fracture edge highlight
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.globalAlpha = Math.max(0, fragAlpha * 0.68);
          ctx.strokeRect(-half, -half, s, s);

          ctx.restore();
        } else if (p.kind === 'heart') {
          // Floating kawaii heart particle emitted when kittens cheer or get petted
          const s = p.size * (1 - lifeRatio * 0.25);
          ctx.save();
          ctx.globalAlpha = Math.max(0, baseAlpha * 0.94);
          ctx.translate(p.x + titleOffsetX, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, s * 0.35);
          ctx.bezierCurveTo(-s * 0.85, -s * 0.35, -s * 0.45, -s * 0.95, 0, -s * 0.35);
          ctx.bezierCurveTo(s * 0.45, -s * 0.95, s * 0.85, -s * 0.35, 0, s * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (p.kind === 'paw') {
          // Floating toe-bean paw print particle
          const s = p.size * (1 - lifeRatio * 0.25);
          ctx.save();
          ctx.globalAlpha = Math.max(0, baseAlpha * 0.92);
          ctx.translate(p.x + titleOffsetX, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, s * 0.18, s * 0.42, s * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
          for (const [bxOff, byOff] of [
            [-s * 0.38, -s * 0.18],
            [-s * 0.14, -s * 0.38],
            [s * 0.14, -s * 0.38],
            [s * 0.38, -s * 0.18],
          ]) {
            ctx.beginPath();
            ctx.arc(bxOff, byOff, s * 0.16, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = Math.max(0, baseAlpha);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x + titleOffsetX - p.size / 2, p.y - p.size / 2, p.size, p.size);
          ctx.restore();
        }
      }

      // 12. Render Floating Score Popups
      for (let i = 0; i < MAX_POPUPS; i++) {
        const pop = sim.popups[i];
        if (!pop.active) continue;
        const alpha = 1 - Math.pow(pop.life / pop.maxLife, 2);
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = '800 22px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#05070E';
        ctx.lineWidth = 4;
        ctx.strokeText(pop.text, pop.x, pop.y);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, pop.x, pop.y);

        if (pop.subtext) {
          ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
          ctx.strokeText(pop.subtext, pop.x, pop.y + 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(pop.subtext, pop.x, pop.y + 16);
        }
        ctx.restore();
      }

      // 13. Full-Screen Emissive Beat / Sweep Flash
      if (sim.flashAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = sim.flashAlpha;
        ctx.fillStyle = skin.timelineAccent;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      ctx.restore();

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [
    lockCurrentPieceAndAdvance,
    showBanner,
    spawnBlockShatterFragments,
    spawnKittenLoveParticles,
    spawnParticles,
    spawnPopup,
    spawnSideLightTrail,
    spawnSweepSparkle,
  ]);

  // Direct Finger/Thumb Swipe (Left, Right, Directly Down) & Tap 90-Degree Rotation Controls
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (sim.mode !== 'playing') return;
    const now = performance.now();
    sim.touchStartX = e.clientX;
    sim.touchStartY = e.clientY;
    sim.touchAnchorX = e.clientX;
    sim.touchAnchorY = e.clientY;
    sim.touchLastMoveMs = now;
    sim.touchSteppedDuringDrag = false;
    sim.touchStartTime = now;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    sim.pointerXNorm = e.clientX / Math.max(1, window.innerWidth);
    sim.pointerYNorm = e.clientY / Math.max(1, window.innerHeight);

    if (
      sim.mode !== 'playing' ||
      sim.touchStartX === null ||
      sim.touchStartY === null ||
      sim.touchAnchorX === null ||
      sim.touchAnchorY === null
    ) {
      return;
    }

    const now = performance.now();
    const stepDt = Math.max(1, now - sim.touchLastMoveMs);
    const colThreshold = Math.max(18, sim.boardRect.cellSize * 0.68);
    const rowThreshold = Math.max(22, sim.boardRect.cellSize * 0.78);

    const dxFromAnchor = e.clientX - sim.touchAnchorX;
    const dyFromAnchor = e.clientY - sim.touchAnchorY;
    const totalDx = e.clientX - sim.touchStartX;
    const totalDy = e.clientY - sim.touchStartY;

    // 1. Horizontal Swipe Left / Right: comfortable incremental column stepping
    if (Math.abs(dxFromAnchor) >= colThreshold && Math.abs(dxFromAnchor) >= Math.abs(dyFromAnchor) * 0.8) {
      const steps = Math.trunc(dxFromAnchor / colThreshold);
      if (steps !== 0) {
        const dir = steps > 0 ? 'right' : 'left';
        for (let i = 0; i < Math.abs(steps); i++) {
          executePlayerAction(dir);
        }
        sim.touchAnchorX += steps * colThreshold;
        sim.touchAnchorY = e.clientY;
        sim.touchSteppedDuringDrag = true;
        sim.touchLastMoveMs = now;
      }
      return;
    }

    // 2. Brisk Downward Swipe -> Drop Directly Down (Hard Drop) immediately
    const vy = dyFromAnchor / stepDt;
    if (
      totalDy >= 44 &&
      Math.abs(totalDy) > Math.abs(totalDx) * 1.3 &&
      (vy > 0.65 || (totalDy >= 64 && now - sim.touchStartTime < 260))
    ) {
      sim.touchStartX = null;
      sim.touchStartY = null;
      sim.touchAnchorX = null;
      sim.touchAnchorY = null;
      sim.touchSteppedDuringDrag = true;
      executePlayerAction('hardDrop');
      return;
    }

    // 3. Controlled Downward Drag -> Step Down row by row
    if (dyFromAnchor >= rowThreshold && dyFromAnchor > Math.abs(dxFromAnchor) * 1.15) {
      const downSteps = Math.trunc(dyFromAnchor / rowThreshold);
      for (let i = 0; i < downSteps; i++) {
        executePlayerAction('softDrop');
      }
      sim.touchAnchorY += downSteps * rowThreshold;
      sim.touchAnchorX = e.clientX;
      sim.touchSteppedDuringDrag = true;
      sim.touchLastMoveMs = now;
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (sim.mode !== 'playing' || sim.touchStartX === null || sim.touchStartY === null) return;

    const totalDx = e.clientX - sim.touchStartX;
    const totalDy = e.clientY - sim.touchStartY;
    const elapsed = performance.now() - sim.touchStartTime;
    const stepped = sim.touchSteppedDuringDrag;

    sim.touchStartX = null;
    sim.touchStartY = null;
    sim.touchAnchorX = null;
    sim.touchAnchorY = null;
    sim.touchSteppedDuringDrag = false;

    const gesture = classifyTouchEndGesture(totalDx, totalDy, elapsed, stepped);
    if (gesture === 'hardDropSwipe') {
      executePlayerAction('hardDrop');
    } else if (gesture === 'tapRotateCW') {
      // Every tap rotates the active 2x2 block 90 degrees clockwise
      executePlayerAction('rotateCW');
    }
  };

  // Apply custom AI or procedural backdrop to active skin
  const handleApplyBackdrop = (imageUrl: string, customTitle?: string) => {
    const sim = simRef.current;
    const targetSkinId = sim.mode === 'title' ? sim.skins[selectedSkinIdx].id : sim.activeSkin.id;

    setSkins((prev) => {
      const updated = prev.map((s) =>
        s.id === targetSkinId
          ? {
              ...s,
              customBackdropUrl: imageUrl,
              subtitle: customTitle ? `Custom Backdrop · ${customTitle}` : s.subtitle,
            }
          : s
      );
      sim.skins = updated;
      const matched = updated.find((s) => s.id === sim.activeSkin.id);
      if (matched) {
        sim.activeSkin = matched;
        setHudSkin(matched);
      }
      return updated;
    });

    showBanner('Custom Stage Backdrop Applied!', 2200);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#07090F]">
      {/* Full-Viewport Interactive Touch & Swipe Canvas2D Stage */}
      <canvas
        ref={canvasRef}
        data-testid="lumines-canvas"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        className="block w-full h-full cursor-pointer touch-none"
      />

      {/* Title Screen Overlay */}
      {mode === 'title' && (
        <TitleScreen
          skins={skins}
          selectedSkinIndex={selectedSkinIdx}
          onSelectSkin={(idx) => {
            setSelectedSkinIdx(idx);
            simRef.current.startingSkinIdx = idx;
            simRef.current.activeSkin = skins[idx];
            setHudSkin(skins[idx]);
            setHudBpm(skins[idx].bpm);
            haptics.trigger('move');
          }}
          onStartGame={() => startNewRun(selectedSkinIdx)}
          onOpenSkinStudio={() => setIsSkinStudioOpen(true)}
          highScore={hudHighScore}
        />
      )}

      {/* Active Gameplay HUD */}
      {mode !== 'title' && (
        <GameHud
          score={hudScore}
          highScore={hudHighScore}
          clearedSquares={hudSquares}
          combo={hudCombo}
          sweptPendingCount={hudSweptPending}
          level={hudLevel}
          bpm={hudBpm}
          skin={hudSkin}
          nextQueue={hudNextQueue}
          isMuted={isMuted}
          hapticsEnabled={hapticsEnabled}
          hapticPulseIntensity={hapticPulse}
          bannerText={bannerText}
          onToggleMute={() => setIsMuted(audioEngine.toggleMute())}
          onToggleHaptics={() => setHapticsEnabled(haptics.toggle())}
          onPetKittens={handlePetKittens}
          onOpenSkinStudio={() => {
            if (mode === 'playing') {
              audioEngine.stopLoop();
              updateGameStateMode('paused');
            }
            setIsSkinStudioOpen(true);
          }}
          onPause={() => {
            if (mode === 'playing') {
              audioEngine.stopLoop();
              updateGameStateMode('paused');
            } else if (mode === 'paused') {
              updateGameStateMode('playing');
              audioEngine.startLoop();
            }
          }}
          onRestart={() => startNewRun(selectedSkinIdx)}
        />
      )}

      {/* Pause & Game Over Modal */}
      <StatusModal
        mode={mode}
        skin={hudSkin}
        score={hudScore}
        highScore={hudHighScore}
        clearedSquares={hudSquares}
        level={hudLevel}
        bpm={hudBpm}
        snapshot={runSnapshot}
        onResume={() => {
          updateGameStateMode('playing');
          audioEngine.startLoop();
        }}
        onRestart={() => startNewRun(selectedSkinIdx)}
        onTitle={() => {
          audioEngine.stopLoop();
          updateGameStateMode('title');
        }}
      />

      {/* Gemini 2.1 Nano Banana Stage Skin Studio Modal */}
      <SkinStudioModal
        isOpen={isSkinStudioOpen}
        onClose={() => setIsSkinStudioOpen(false)}
        activeSkin={mode === 'title' ? skins[selectedSkinIdx] : hudSkin}
        onApplyBackdrop={handleApplyBackdrop}
      />
    </main>
  );
}
