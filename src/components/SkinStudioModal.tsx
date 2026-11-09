import React, { useState } from 'react';
import { SkinTheme } from '../game/types';
import { synthesizeGeometricBackdropDataUrl } from '../game/skins';

interface SkinStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSkin: SkinTheme;
  onApplyBackdrop: (imageUrl: string, customTitle?: string) => void;
}

const PRESET_PROMPTS = [
  'Neon Shibuya equalizer towers with cyan and coral geometric reflections',
  'Minimalist Bauhaus solar eclipse with golden concentric pulse rings',
  'Cybernetic acid lime soundwave matrix over deep obsidian glass',
  'Velvet horizon synthwave canyon with mint and tangerine prism beams',
];

export const SkinStudioModal: React.FC<SkinStudioModalProps> = ({
  isOpen,
  onClose,
  activeSkin,
  onApplyBackdrop,
}) => {
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0]);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '1:1' | '9:16' | '4:3' | '4:1'>('16:9');
  const [imageSize, setImageSize] = useState<'1K' | '2K'>('1K');
  const [previewUrl, setPreviewUrl] = useState<string>(() =>
    activeSkin.customBackdropUrl || synthesizeGeometricBackdropDataUrl(activeSkin, 1)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seedCounter, setSeedCounter] = useState(2);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewUrl(reader.result);
        setMode('edit');
        setErrorMessage(null);
        setStatusMessage('Loaded custom image. Enter edit instructions below to transform it.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSynthesizeProcedural = () => {
    const nextSeed = seedCounter + 1;
    setSeedCounter(nextSeed);
    const dataUrl = synthesizeGeometricBackdropDataUrl(activeSkin, nextSeed, prompt);
    setPreviewUrl(dataUrl);
    setErrorMessage(null);
    setStatusMessage('Generated procedural geometric backdrop on local canvas.');
  };

  const handleRunGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setErrorMessage('Please enter a descriptive text prompt first.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(
      mode === 'create'
        ? 'Generating stage backdrop with gemini-nano-banana-2.1...'
        : 'Editing stage backdrop with gemini-nano-banana-2.1...'
    );

    try {
      const endpoint = mode === 'create' ? '/api/images/generate' : '/api/images/edit';
      const payload =
        mode === 'create'
          ? { prompt: prompt.trim(), aspectRatio, imageSize }
          : {
              prompt: prompt.trim(),
              imageDataUrl: previewUrl || synthesizeGeometricBackdropDataUrl(activeSkin, seedCounter),
              aspectRatio,
              imageSize,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        const errText = data.error || 'Image generation failed.';
        if (data.requiresPaidKey) {
          setErrorMessage(
            `${errText} — Note: gemini-nano-banana-2.1 requires a billing-enabled API key in Settings > Secrets. You can also click "Remix Procedural Canvas" below for instant geometric art.`
          );
        } else {
          setErrorMessage(errText);
        }
        setStatusMessage(null);
      } else {
        setPreviewUrl(data.imageUrl);
        setStatusMessage(
          mode === 'create'
            ? 'Created new AI backdrop with gemini-nano-banana-2.1!'
            : 'Edited backdrop with gemini-nano-banana-2.1!'
        );
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error while contacting image endpoint.');
      setStatusMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyToStage = () => {
    if (previewUrl) {
      onApplyBackdrop(previewUrl, prompt.trim().slice(0, 28));
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skin-studio-title"
    >
      <div className="w-full max-w-2xl bg-[#0D121F] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 id="skin-studio-title" className="text-xl font-bold tracking-tight font-display">
              Stage Skin Studio
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Create or edit stage backdrops with gemini-nano-banana-2.1 · Active Skin: {activeSkin.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Skin Studio"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleRunGemini} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Segmented Mode Selector */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('create');
                  setErrorMessage(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'create'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Create Image
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('edit');
                  setErrorMessage(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'edit'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Edit Current Image
              </button>
            </div>

            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap">
              <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Upload Source Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>

          {/* Live Backdrop Preview Frame */}
          <div className="relative w-full h-44 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex items-center justify-center">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Stage Skin Backdrop Preview"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-xs text-slate-500">No backdrop preview loaded</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent flex items-end justify-between p-3">
              <span className="text-xs font-medium text-slate-200">
                {mode === 'create' ? 'Target Stage Canvas Preview' : 'Source Image for Gemini Edit'}
              </span>
              <button
                type="button"
                onClick={handleSynthesizeProcedural}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 rounded-md transition-colors whitespace-nowrap"
              >
                Remix Procedural Canvas
              </button>
            </div>
          </div>

          {/* Prompt Input */}
          <div>
            <label htmlFor="skin-prompt-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
              {mode === 'create'
                ? 'Text Prompt for New Stage Backdrop'
                : 'Edit Instructions for Current Backdrop'}
            </label>
            <textarea
              id="skin-prompt-input"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === 'create'
                  ? 'Describe the geometric rhythm backdrop you want to create...'
                  : 'Describe how to edit this image (e.g. Add glowing prism waves and gold wireframe cubes)...'
              }
              className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            {/* Quick Inspiration Prompts */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {PRESET_PROMPTS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(preset)}
                  className="px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-md transition-colors truncate max-w-[260px]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio & Resolution Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="aspect-ratio-select" className="block text-xs font-medium text-slate-400 mb-1">
                Aspect Ratio
              </label>
              <select
                id="aspect-ratio-select"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400"
              >
                <option value="16:9">16:9 Widescreen Stage</option>
                <option value="1:1">1:1 Square Vinyl Sleeve</option>
                <option value="9:16">9:16 Mobile Portrait</option>
                <option value="4:3">4:3 Arcade CRT</option>
                <option value="4:1">4:1 Panoramic Banner</option>
              </select>
            </div>
            <div>
              <label htmlFor="image-size-select" className="block text-xs font-medium text-slate-400 mb-1">
                Resolution
              </label>
              <select
                id="image-size-select"
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400"
              >
                <option value="1K">1K Standard HD</option>
                <option value="2K">2K Ultra Crisp</option>
              </select>
            </div>
          </div>

          {/* Status & Error Alerts */}
          {statusMessage && (
            <div className="px-3.5 py-2.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-xs text-cyan-200">
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-lg bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {isLoading
                ? 'Running Gemini...'
                : mode === 'create'
                ? 'Generate with Gemini'
                : 'Edit with Gemini'}
            </button>
            <button
              type="button"
              onClick={handleApplyToStage}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors whitespace-nowrap"
            >
              Apply Backdrop to Stage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
