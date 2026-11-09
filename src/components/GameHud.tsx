import React from 'react';
import { CellMatrix2x2, SkinTheme } from '../game/types';

interface GameHudProps {
  score: number;
  highScore: number;
  clearedSquares: number;
  combo: number;
  sweptPendingCount: number;
  level: number;
  bpm: number;
  skin: SkinTheme;
  nextQueue: CellMatrix2x2[];
  isMuted: boolean;
  hapticsEnabled: boolean;
  hapticPulseIntensity: number;
  bannerText: string | null;
  onToggleMute: () => void;
  onToggleHaptics: () => void;
  onPetKittens: () => void;
  onOpenSkinStudio: () => void;
  onPause: () => void;
  onRestart: () => void;
}

const MiniPieceSvg: React.FC<{ cells: CellMatrix2x2; skin: SkinTheme; index: number }> = ({
  cells,
  skin,
  index,
}) => {
  const size = index === 0 ? 38 : 30;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className="shrink-0"
      aria-label={`Next piece ${index + 1}`}
    >
      {[0, 1].map((r) =>
        [0, 1].map((c) => {
          const cell = cells[r][c];
          const fill = cell.color === 1 ? skin.color1Fill : skin.color2Fill;
          const inner = cell.color === 1 ? skin.color1Inner : skin.color2Inner;
          const x = c * 19 + 2;
          const y = r * 19 + 2;
          return (
            <g key={`${r}-${c}`}>
              <rect
                x={x}
                y={y}
                width="17"
                height="17"
                rx="3"
                fill={fill}
                stroke="#060810"
                strokeWidth="1.5"
              />
              <rect x={x + 3.5} y={y + 3.5} width="10" height="10" rx="1.5" fill={inner} opacity="0.7" />
              {cell.color === 1 ? (
                <path
                  d={`M${x + 5.2} ${y + 11.5} L${x + 5.2} ${y + 6.2} L${x + 7.4} ${y + 8} L${x + 9.6} ${y + 8} L${x + 11.8} ${y + 6.2} L${x + 11.8} ${y + 11.5} Z`}
                  fill="#060810"
                  opacity="0.38"
                />
              ) : (
                <g fill="#060810" opacity="0.38">
                  <circle cx={x + 8.5} cy={y + 10.2} r="2.1" />
                  <circle cx={x + 6.2} cy={y + 7.2} r="1" />
                  <circle cx={x + 8.5} cy={y + 6.5} r="1" />
                  <circle cx={x + 10.8} cy={y + 7.2} r="1" />
                </g>
              )}
              {cell.isSpecial && (
                <circle cx={x + 8.5} cy={y + 8.5} r="3.5" fill="#FFFFFF" stroke="#060810" strokeWidth="1.2" />
              )}
            </g>
          );
        })
      )}
    </svg>
  );
};

export const GameHud: React.FC<GameHudProps> = ({
  score,
  highScore,
  clearedSquares,
  combo,
  sweptPendingCount,
  level,
  bpm,
  skin,
  nextQueue,
  isMuted,
  hapticsEnabled,
  hapticPulseIntensity,
  bannerText,
  onToggleMute,
  onToggleHaptics,
  onPetKittens,
  onOpenSkinStudio,
  onPause,
  onRestart,
}) => {
  return (
    <div className="fixed inset-0 z-10 flex flex-col justify-between pointer-events-none select-none">
      {/* Top Perimeter Dock */}
      <div className="w-full px-2 sm:px-6 pt-2.5 sm:pt-4 flex items-start justify-between gap-1 sm:gap-6">
        {/* Left: Primary Hero Metrics (Score, Level, Cleared Squares, Chain) */}
        <div className="flex items-center gap-2 sm:gap-6 bg-[#090D18]/90 border border-slate-800/90 rounded-2xl px-2.5 sm:px-5 py-1.5 sm:py-2 shadow-xl shrink-0">
          <div>
            <div className="text-[8px] sm:text-[11px] font-bold uppercase text-slate-400 hud-kicker">
              Score
            </div>
            <div
              data-testid="hud-score-numeral"
              className="text-sm sm:text-3xl font-extrabold text-white hud-numeral hud-beat-pulse-score leading-tight"
            >
              {Math.round(score).toLocaleString()}
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block" />

          <div>
            <div className="text-[8px] sm:text-[11px] font-bold uppercase text-slate-400 hud-kicker">
              Level
            </div>
            <div
              data-testid="hud-level-numeral"
              className="text-sm sm:text-3xl font-extrabold hud-numeral hud-beat-pulse-level leading-tight"
              style={{ color: skin.color2Fill }}
            >
              {Math.round(level)}
              <span className="hidden md:inline text-xs sm:text-sm font-mono-tabular text-slate-400 ml-1.5">
                · {Math.round(bpm)} BPM
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block" />

          <div>
            <div className="text-[8px] sm:text-[11px] font-bold uppercase text-slate-400 hud-kicker">
              Squares
            </div>
            <div
              className="text-sm sm:text-3xl font-extrabold hud-numeral leading-tight"
              style={{ color: skin.color1Fill }}
            >
              {Math.round(clearedSquares)}
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block" />

          <div>
            <div className="text-[8px] sm:text-[11px] font-bold uppercase text-slate-400 hud-kicker">
              Chain
            </div>
            <div
              className="text-sm sm:text-3xl font-extrabold hud-numeral leading-tight"
              style={{ color: combo > 1 ? skin.timelineAccent : '#E2E8F0' }}
            >
              {Math.max(1, Math.round(combo))}×
            </div>
          </div>
        </div>

        {/* Center: Next 3 2x2 Pieces Dock (1 piece on narrow mobile, 3 on sm+) */}
        <div
          className="flex items-center gap-2 bg-[#090D18]/90 border border-slate-800/90 rounded-2xl px-2 sm:px-3.5 py-1.5 sm:py-2 shadow-xl shrink-0"
          aria-label="Next pieces queue"
        >
          <span className="text-[10px] font-bold uppercase text-slate-400 hud-kicker hidden sm:inline">
            Next
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {nextQueue.slice(0, 3).map((cells, idx) => (
              <div key={idx} className={idx > 0 ? 'hidden sm:block' : 'block'}>
                <MiniPieceSvg cells={cells} skin={skin} index={idx} />
              </div>
            ))}
          </div>
        </div>

        {/* Right: Utility Controls (Pet Kittens [K], Mute [M], Haptics [H], Backdrop [B], Restart [R], Pause [P]) */}
        <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto shrink-0">
          <button
            type="button"
            tabIndex={-1}
            data-testid="pet-kittens-btn"
            aria-label="Pet Kittens [K]"
            title="Pet the Kittens! [K]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPetKittens();
            }}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#090D18]/90 hover:bg-slate-800 active:scale-95 border border-slate-800 text-pink-300 flex items-center justify-center transition-all shadow-lg"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3.1-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9" cy="13" r="1" fill="currentColor" />
              <circle cx="15" cy="13" r="1" fill="currentColor" />
              <path d="M10.5 16c.8.67 2.2.67 3 0" strokeLinecap="round" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={isMuted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            title="Mute / Unmute Audio [M]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#090D18]/90 hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center justify-center transition-colors shadow-lg"
          >
            {isMuted ? (
              <svg className="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={hapticsEnabled ? 'Disable Haptics [H]' : 'Enable Haptics [H]'}
            title="Toggle Tactile Haptics [H]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleHaptics();
            }}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#090D18]/90 hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center justify-center transition-colors shadow-lg relative"
          >
            <svg
              className="w-5 h-5"
              style={{
                color: hapticsEnabled ? skin.timelineAccent : '#64748B',
                transform: hapticPulseIntensity > 0.1 ? `scale(${1 + hapticPulseIntensity * 0.18})` : 'scale(1)',
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="7" y="4" width="10" height="16" rx="2" />
              <path d="M3 8v8M21 8v8" strokeLinecap="round" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Open Skin Studio [B]"
            title="Skin Studio (Create & Edit Backdrop) [B]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenSkinStudio();
            }}
            className="hidden sm:flex min-w-[44px] min-h-[44px] rounded-xl bg-[#090D18]/90 hover:bg-slate-800 border border-slate-800 text-slate-200 items-center justify-center transition-colors shadow-lg"
          >
            <svg className="w-5 h-5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Restart Run [R]"
            title="Restart Run [R]"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="hidden sm:flex min-w-[44px] min-h-[44px] rounded-xl bg-[#090D18]/90 hover:bg-slate-800 border border-slate-800 text-slate-200 items-center justify-center transition-colors shadow-lg"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game [P]"
            title="Pause Game [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#090D18]/90 hover:bg-slate-800 border border-slate-800 text-slate-200 flex items-center justify-center transition-colors shadow-lg"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Transient Event Callout Banner (Sweep Bonus / Skin Transition) */}
      {bannerText && (
        <div className="mx-auto px-5 py-1.5 rounded-xl bg-[#090D18]/95 border border-slate-700 text-sm sm:text-base font-display font-bold tracking-wide text-white shadow-xl">
          {bannerText}
        </div>
      )}

      {/* Unobstructed Bottom Safe Margin: Non-interactive Touch Gesture Guide & Stage Metadata */}
      <div className="w-full px-3 sm:px-6 pb-2.5 sm:pb-4 flex items-center justify-center sm:justify-between text-[11px] sm:text-xs text-slate-400">
        <div className="flex items-center gap-2 truncate">
          <span className="hidden sm:inline font-semibold text-slate-200">{skin.name}</span>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <span className="text-slate-300">Swipe ←/→ Move · Swipe ↓ Drop · Tap to Rotate 90°</span>
          {sweptPendingCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300 font-mono-tabular font-semibold">
                Sweep Buffer: {sweptPendingCount} sq
              </span>
            </>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono-tabular shrink-0">
          <span>Best: {Math.round(highScore).toLocaleString()}</span>
          <span aria-hidden="true">·</span>
          <span>Haptics: {hapticsEnabled ? 'Active' : 'Off'}</span>
        </div>
      </div>
    </div>
  );
};
