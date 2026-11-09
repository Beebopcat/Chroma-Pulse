import React from 'react';
import { EndOfRunSnapshot, GameStateMode, SkinTheme } from '../game/types';

interface StatusModalProps {
  mode: GameStateMode;
  skin: SkinTheme;
  score: number;
  highScore: number;
  clearedSquares: number;
  level: number;
  bpm: number;
  snapshot: EndOfRunSnapshot | null;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  mode,
  skin,
  score,
  highScore,
  clearedSquares,
  level,
  bpm,
  snapshot,
  onResume,
  onRestart,
  onTitle,
}) => {
  if (mode !== 'paused' && mode !== 'gameover') return null;

  const isGameOver = mode === 'gameover';
  const finalScore = isGameOver && snapshot ? snapshot.score : score;
  const finalBest = isGameOver && snapshot ? snapshot.highScore : highScore;
  const finalSquares = isGameOver && snapshot ? snapshot.clearedSquares : clearedSquares;
  const finalCombo = isGameOver && snapshot ? snapshot.maxSweepCombo : 0;
  const finalBpm = isGameOver && snapshot ? snapshot.peakBpm : bpm;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-heading"
    >
      <div className="w-full max-w-md bg-[#0C111D] border border-slate-700/80 rounded-2xl p-6 shadow-2xl text-slate-100 space-y-6">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-400">
            {isGameOver ? `Stage Reached · ${snapshot?.skinName || skin.name}` : `Active Stage · ${skin.name}`}
          </div>
          <h2 id="status-modal-heading" className="text-3xl font-extrabold font-display tracking-tight text-white">
            {isGameOver ? 'Grid Overflow' : 'Game Paused'}
          </h2>
        </div>

        {/* 3 Tabular Stat Tiles */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Score</div>
            <div className="text-xl font-bold font-mono-tabular text-white mt-1">
              {Math.round(finalScore).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
              Best {Math.round(finalBest).toLocaleString()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase">2×2 Cleared</div>
            <div
              className="text-xl font-bold font-mono-tabular mt-1"
              style={{ color: skin.color1Fill }}
            >
              {Math.round(finalSquares)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
              Level {isGameOver && snapshot ? snapshot.levelReached : level}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase">
              {isGameOver ? 'Max Chain' : 'Tempo'}
            </div>
            <div
              className="text-xl font-bold font-mono-tabular mt-1"
              style={{ color: skin.color2Fill }}
            >
              {isGameOver ? `${finalCombo}×` : `${finalBpm}`}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
              {finalBpm} BPM
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {!isGameOver ? (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="flex-1 min-h-[48px] px-5 py-3 rounded-xl font-display font-bold text-sm text-slate-950 transition-transform active:scale-[0.98]"
              style={{ backgroundColor: skin.color1Fill }}
            >
              Resume Game
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="flex-1 min-h-[48px] px-5 py-3 rounded-xl font-display font-bold text-sm text-slate-950 transition-transform active:scale-[0.98]"
              style={{ backgroundColor: skin.color1Fill }}
            >
              Try Again
            </button>
          )}

          {!isGameOver && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="min-h-[48px] px-4 py-3 rounded-xl font-semibold text-sm text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 transition-colors"
            >
              Restart
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onTitle();
            }}
            className="min-h-[48px] px-4 py-3 rounded-xl font-semibold text-sm text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};
