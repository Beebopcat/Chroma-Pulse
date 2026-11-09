import React from 'react';
import { SkinTheme } from '../game/types';

interface TitleScreenProps {
  skins: SkinTheme[];
  selectedSkinIndex: number;
  onSelectSkin: (index: number) => void;
  onStartGame: () => void;
  onOpenSkinStudio: () => void;
  highScore: number;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  skins,
  selectedSkinIndex,
  onSelectSkin,
  onStartGame,
  onOpenSkinStudio,
  highScore,
}) => {
  const activeSkin = skins[selectedSkinIndex] || skins[0];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10 pointer-events-none">
      {/* Top Status Strip */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs font-medium text-slate-300">
          <span>Rhythm Block Puzzle</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">{activeSkin.bpm} BPM Sync</span>
          {highScore > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-amber-300">Best {highScore.toLocaleString()}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenSkinStudio}
          className="pointer-events-auto min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-100 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>Skin Studio</span>
        </button>
      </div>

      {/* Main Negative-Space Focal Lockup (Left/Center Asymmetric Anchor) */}
      <div className="my-auto max-w-lg space-y-6 pointer-events-auto">
        {/* Custom Inline SVG Title Lockup & Emblem */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-3.5">
            <svg
              className="w-14 h-14 shrink-0"
              viewBox="0 0 64 64"
              fill="none"
              aria-hidden="true"
            >
              {/* Cute Cat Ears perched atop the 2x2 Luminous Block Emblem */}
              <polygon
                points="6,10 12,1 20,10"
                fill={activeSkin.color1Fill}
                stroke="#05070E"
                strokeWidth="2.5"
              />
              <polygon
                points="36,10 44,1 50,10"
                fill={activeSkin.color2Fill}
                stroke="#05070E"
                strokeWidth="2.5"
              />
              {/* 2x2 Luminous Block Emblem */}
              <rect
                x="4"
                y="8"
                width="24"
                height="22"
                rx="4"
                fill={activeSkin.color1Fill}
                stroke="#05070E"
                strokeWidth="3"
              />
              <rect
                x="9"
                y="12"
                width="14"
                height="14"
                rx="2"
                fill={activeSkin.color1Inner}
              />
              <rect
                x="32"
                y="8"
                width="24"
                height="22"
                rx="4"
                fill={activeSkin.color2Fill}
                stroke="#05070E"
                strokeWidth="3"
              />
              <rect
                x="4"
                y="34"
                width="24"
                height="22"
                rx="4"
                fill={activeSkin.color2Fill}
                stroke="#05070E"
                strokeWidth="3"
              />
              <rect
                x="32"
                y="34"
                width="24"
                height="22"
                rx="4"
                fill={activeSkin.color1Fill}
                stroke="#05070E"
                strokeWidth="3"
              />
              <rect
                x="37"
                y="38"
                width="14"
                height="14"
                rx="2"
                fill={activeSkin.color1Inner}
              />
              {/* Timeline Sweep Line */}
              <line
                x1="59"
                y1="4"
                x2="59"
                y2="60"
                stroke={activeSkin.timelineAccent}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight font-display text-white leading-none whitespace-nowrap">
                CHROMA PULSE
              </h1>
              <p className="text-sm sm:text-base text-slate-300 font-medium mt-1.5 text-balance">
                Form 2×2 squares with DJ Whiskers &amp; the beat-dancing Kitten Crew!
              </p>
            </div>
          </div>
        </div>

        {/* Starting Skin / Tempo Selector */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400">
            Select Starting Stage Skin & Tempo
          </div>
          <div
            role="radiogroup"
            aria-label="Select Starting Stage Skin"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {skins.map((skin, idx) => {
              const isSelected = idx === selectedSkinIndex;
              return (
                <button
                  key={skin.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectSkin(idx)}
                  className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left transition-transform active:scale-[0.98] flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-slate-900/95 border-white shadow-lg'
                      : 'bg-slate-950/80 border-slate-800/90 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{skin.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{skin.subtitle}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="w-3.5 h-3.5 rounded-sm border border-black/50"
                      style={{ backgroundColor: skin.color1Fill }}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-sm border border-black/50"
                      style={{ backgroundColor: skin.color2Fill }}
                    />
                    <span className="text-xs font-mono-tabular font-semibold text-slate-200 ml-1">
                      {skin.bpm}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary CTA + Secondary Action */}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStartGame();
            }}
            className="min-h-[52px] px-8 py-3.5 rounded-xl font-display font-bold text-base text-slate-950 shadow-xl transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
            style={{ backgroundColor: activeSkin.color1Fill }}
          >
            Start Game
          </button>
          <button
            type="button"
            onClick={onOpenSkinStudio}
            className="min-h-[52px] px-5 py-3.5 rounded-xl font-medium text-sm text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            Customize Backdrop
          </button>
        </div>
      </div>

      {/* Bottom Safe Margin Control Hint */}
      <div className="text-xs text-slate-400 font-medium">
        Swipe ←/→/↓ Move &amp; Drop · Tap Block to Rotate 90° · A/D or ←/→ Move · W/↑ Rotate · Space Drop · P Pause
      </div>
    </div>
  );
};
